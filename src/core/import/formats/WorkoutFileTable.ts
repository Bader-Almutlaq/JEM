import { CsvTable } from '../CsvTable';
import { ImportError } from '../ImportError';
import { readExportNumber } from '../readExportNumber';
import { trimWhitespace } from '../trimWhitespace';
import type { WeightUnit } from '../../units/WeightUnit';
import { readWeightUnit } from './readWeightUnit';

/** Header names under which an app writes its weights; each list is tried case-insensitively. */
export interface WeightColumnNames {
  readonly kilograms: readonly string[];
  readonly pounds: readonly string[];
  /** A weight column whose unit is written per row in another column (`Weight` + `Weight Unit`). */
  readonly plain?: { readonly value: string; readonly unit: string };
}

/** A weight number with the unit its export column or row states. */
export interface ExplicitWeight {
  readonly value: number;
  readonly unit: WeightUnit;
}

/**
 * Shared CSV field validation for the three adapters. Unknown columns are ignored, blank
 * numeric cells are absent, decimal commas are accepted, and invalid numbers never become zero.
 */
export class WorkoutFileTable {
  readonly table: CsvTable;

  constructor(text: string, required: readonly string[]) {
    this.table = CsvTable.parse(text);
    for (const column of required) {
      if (this.table.columnIndex(column) === undefined) {
        throw new ImportError({ kind: 'missingColumn', column });
      }
    }
  }

  /** Trimmed cell text, or empty for absent optional columns. */
  field(fields: readonly string[], ...columns: string[]): string {
    const column = this.table.columnIndex(...columns);
    return column === undefined ? '' : trimWhitespace(fields[column] ?? '');
  }

  /** Nonempty identity text; empty exercise names and dates must not merge unrelated records. */
  requiredField(fields: readonly string[], line: number, column: string): string {
    const value = this.field(fields, column);
    if (value === '') throw this.invalid(column, value, line);
    return value;
  }

  /** Finite nonnegative decimal (decimal comma or digit grouping allowed, see `readExportNumber`), or null for a missing optional value. */
  number(fields: readonly string[], line: number, ...columns: string[]): number | null {
    const raw = this.field(fields, ...columns);
    if (raw === '') return null;
    const value = readExportNumber(raw);
    if (value === undefined || value < 0) throw this.invalid(columns[0] ?? 'number', raw, line);
    return value;
  }

  /**
   * A reader for the weight cells of this file, so a layout this parser does not know can never import as
   * zero-weight sets: if the header has a weight-like column but none of `names`, the import stops naming
   * the expected column. A file with no weight column at all (cardio only) reads as weight 0.
   *
   * Per row, a populated kilogram cell wins, then a pound cell, then the plain `value` cell whose unit comes
   * from the row's `unit` cell (an unknown or blank unit beside a weight is refused rather than guessed).
   */
  weightReader(names: WeightColumnNames): (fields: readonly string[], line: number) => ExplicitWeight {
    const exists = (columns: readonly string[]) => this.table.columnIndex(...columns) !== undefined;
    const plainValue = names.plain === undefined ? [] : [names.plain.value];
    if (!exists(names.kilograms) && !exists(names.pounds) && !exists(plainValue)) {
      if (this.table.header.some((column) => /weight/i.test(column))) {
        throw new ImportError({ kind: 'missingColumn', column: names.kilograms[0] ?? 'weight' });
      }
      return () => ({ value: 0, unit: 'kg' });
    }
    const poundsOnly = exists(names.pounds) && !exists(names.kilograms) && !exists(plainValue);
    return (fields, line) => {
      if (this.field(fields, ...names.kilograms) !== '') {
        return { value: this.number(fields, line, ...names.kilograms) ?? 0, unit: 'kg' };
      }
      if (this.field(fields, ...names.pounds) !== '') {
        return { value: this.number(fields, line, ...names.pounds) ?? 0, unit: 'lb' };
      }
      const plain = names.plain;
      if (plain !== undefined && this.field(fields, plain.value) !== '') {
        const unitText = this.field(fields, plain.unit);
        const unit = readWeightUnit(unitText);
        if (unit === undefined) throw this.invalid(plain.unit, unitText, line);
        return { value: this.number(fields, line, plain.value) ?? 0, unit };
      }
      return { value: 0, unit: poundsOnly ? 'lb' : 'kg' };
    };
  }

  /** Creates the shared owner-readable value error with its original file row identifier. */
  invalid(column: string, value: string, line: number): ImportError {
    return new ImportError({ kind: 'invalidValue', column, value, line });
  }
}
