import { CsvTable } from '../CsvTable';
import { ImportError } from '../ImportError';
import { readExportNumber } from '../readExportNumber';
import { trimWhitespace } from '../trimWhitespace';
import type { WeightUnit } from '../../units/WeightUnit';

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

  /** Explicit weight value and column unit. When both columns exist, prefer a populated kg cell. */
  weight(
    fields: readonly string[],
    line: number,
    kilograms: string,
    pounds: string,
  ): { value: number; unit: WeightUnit } {
    const usePounds = this.field(fields, kilograms) === '' && this.table.columnIndex(pounds) !== undefined;
    return {
      value: this.number(fields, line, usePounds ? pounds : kilograms) ?? 0,
      unit: usePounds ? 'lb' : 'kg',
    };
  }

  /** Creates the shared owner-readable value error with its original file row identifier. */
  invalid(column: string, value: string, line: number): ImportError {
    return new ImportError({ kind: 'invalidValue', column, value, line });
  }
}
