import type { Database as RawDatabase, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { loadSqlite } from './loadSqlite';
import { DatabaseError } from './DatabaseError';
import { QueryCache } from './QueryCache';

/** A value SQLite can store or return. Booleans are stored as 0/1 integers. */
export type SqlValue = string | number | bigint | Uint8Array | null;

/** Positional (`?`) or named (`$name`) statement parameters. */
export type SqlParams = readonly SqlValue[] | Readonly<Record<string, SqlValue>>;

/** What a write statement did. */
export interface RunResult {
  /** Rows inserted, updated or deleted by the statement. */
  readonly changes: number;
  /** Row id of the last inserted row on this connection. */
  readonly lastInsertRowId: number;
}

/**
 * The one way WorkoutCore talks to SQLite: a thin, synchronous wrapper over the official
 * SQLite WebAssembly build.
 *
 * Everything is synchronous because the database lives in a Web Worker (see `src/worker/`),
 * so a query never blocks the screen. Foreign keys are switched on for every connection.
 *
 * Row types passed as `Row` are not checked at runtime: each query's SQL and its row
 * interface must be kept in step, and the tests for that query prove it.
 */
export class Database {
  private transactionDepth = 0;
  private writeCount = 0;

  /** Query results kept until the next write on this connection (see `QueryCache`). */
  readonly cache: QueryCache = new QueryCache(() => this.writeCount);

  private constructor(
    private readonly raw: RawDatabase,
    private readonly sqlite: Sqlite3Static,
  ) {
    raw.exec('PRAGMA foreign_keys = ON');
  }

  /**
   * A number that moves whenever this connection's data may have changed: after every `run` and `exec`
   * (so every write, import, migration and restore step) and after a rollback that undid writes.
   * Equal values mean equal data, which is what lets `cache` reuse results. It starts at 0 for each
   * connection; a restore opens a new connection, with a new, empty cache.
   */
  get dataVersion(): number {
    return this.writeCount;
  }

  /** Opens an empty database in memory. Used by tests and to inspect backup files. */
  static async openInMemory(): Promise<Database> {
    const sqlite = await loadSqlite();
    return new Database(new sqlite.oo1.DB(':memory:', 'c'), sqlite);
  }

  /** Wraps a connection opened elsewhere (the worker opens the on-device file). */
  static wrap(raw: RawDatabase, sqlite: Sqlite3Static): Database {
    return new Database(raw, sqlite);
  }

  /**
   * Opens an in-memory copy of a complete SQLite file, for example a backup being restored.
   * Throws `DatabaseError` with kind `notADatabase` when the bytes are not SQLite.
   */
  static async fromBytes(bytes: Uint8Array): Promise<Database> {
    const sqlite = await loadSqlite();
    const raw = new sqlite.oo1.DB(':memory:', 'c');
    const pointer = sqlite.wasm.allocFromTypedArray(bytes);
    const flags = sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite.capi.SQLITE_DESERIALIZE_RESIZEABLE;
    const status = sqlite.capi.sqlite3_deserialize(raw, 'main', pointer, bytes.byteLength, bytes.byteLength, flags);
    if (status !== 0) {
      raw.close();
      throw new DatabaseError('notADatabase', `SQLite could not read the file (code ${status}).`);
    }
    const database = new Database(raw, sqlite);
    try {
      database.get('SELECT count(*) FROM sqlite_master');
    } catch (error) {
      database.close();
      throw new DatabaseError('notADatabase', 'The file is not a SQLite database.', error);
    }
    return database;
  }

  /** All rows of a query. */
  all<Row extends object>(sql: string, params: SqlParams = []): Row[] {
    try {
      return this.raw.selectObjects(sql, bindable(params)) as Row[];
    } catch (error) {
      throw new DatabaseError('query', `Query failed: ${firstLine(sql)}`, error);
    }
  }

  /** The first row of a query, or `undefined` when there is none. */
  get<Row extends object>(sql: string, params: SqlParams = []): Row | undefined {
    try {
      return this.raw.selectObject(sql, bindable(params)) as Row | undefined;
    } catch (error) {
      throw new DatabaseError('query', `Query failed: ${firstLine(sql)}`, error);
    }
  }

  /** The first column of the first row, or `undefined` when there is no row. */
  value<Value extends SqlValue>(sql: string, params: SqlParams = []): Value | undefined {
    try {
      return this.raw.selectValue(sql, bindable(params)) as Value | undefined;
    } catch (error) {
      throw new DatabaseError('query', `Query failed: ${firstLine(sql)}`, error);
    }
  }

  /** Runs one write statement. */
  run(sql: string, params: SqlParams = []): RunResult {
    this.writeCount += 1;
    try {
      const bind = bindable(params);
      if (bind === undefined) {
        this.raw.exec(sql);
      } else {
        this.raw.exec({ sql, bind });
      }
      return {
        changes: this.raw.changes(),
        lastInsertRowId: Number(this.sqlite.capi.sqlite3_last_insert_rowid(this.raw)),
      };
    } catch (error) {
      throw new DatabaseError('query', `Statement failed: ${firstLine(sql)}`, error);
    }
  }

  /** Runs several statements with no parameters, such as a migration script. */
  exec(sql: string): void {
    this.writeCount += 1;
    try {
      this.raw.exec(sql);
    } catch (error) {
      throw new DatabaseError('query', `Script failed: ${firstLine(sql)}`, error);
    }
  }

  /**
   * Runs `work` in one transaction: everything is saved, or nothing is.
   * Nested calls become savepoints, so a helper that opens a transaction can be called from another.
   */
  transaction<Result>(work: () => Result): Result {
    const savepoint = `level_${this.transactionDepth}`;
    const isOutermost = this.transactionDepth === 0;
    const changesBefore = this.writeCount;
    this.raw.exec(isOutermost ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
    this.transactionDepth += 1;
    try {
      const result = work();
      this.raw.exec(isOutermost ? 'COMMIT' : `RELEASE ${savepoint}`);
      return result;
    } catch (error) {
      this.raw.exec(isOutermost ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
      // Results read after those writes described data that no longer exists.
      if (this.writeCount !== changesBefore) this.writeCount += 1;
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  /**
   * The whole database as one SQLite file. Used for backups and safety snapshots.
   * The result is a complete, self-contained file that any SQLite tool can open.
   */
  exportBytes(): Uint8Array {
    return this.sqlite.capi.sqlite3_js_db_export(this.raw);
  }

  /** Closes the connection. The object must not be used afterwards. */
  close(): void {
    this.cache.clear();
    this.raw.close();
  }
}

/** SQLite refuses an empty parameter list on a statement with no placeholders, so pass none instead. */
function bindable(params: SqlParams): never {
  const isEmpty = Array.isArray(params) ? params.length === 0 : Object.keys(params).length === 0;
  return (isEmpty ? undefined : params) as never;
}

function firstLine(sql: string): string {
  return sql.trim().split('\n')[0] ?? '';
}
