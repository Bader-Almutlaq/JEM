import { parseDecimal } from './parseDecimal';

/** `1,234` / `12,345,678`: comma-grouped thousands with no decimals. */
const COMMA_THOUSANDS = /^[1-9]\d{0,2}(?:,\d{3})+$/;
/** `1,234.5`: English grouping with a decimal point. */
const ENGLISH_GROUPED = /^[1-9]\d{0,2}(?:,\d{3})+\.\d+$/;
/** `1.234,5`: continental grouping with a decimal comma. */
const CONTINENTAL_GROUPED = /^[1-9]\d{0,2}(?:\.\d{3})+,\d+$/;
/** `1,234`: one comma and exactly three digits after it, which reads as thousands or as three decimals. */
const AMBIGUOUS_COMMA = /^[1-9]\d{0,2},\d{3}$/;

/**
 * Reads a number cell from a workout export, accepting a decimal comma (`61,23`) and digit grouping.
 *
 * Exports differ by app locale: continental phones write `61,23`, English ones may write `1,000` or
 * `1,234.5`. A lone comma followed by exactly three digits (`1,234`) could mean 1234 or 1.234, and
 * guessing wrong would silently scale a weight by 1000, so it is refused: `undefined` makes the
 * caller report the cell to the owner. Heuristic: weights and distances are not recorded to three
 * decimals, so only the grouped reading is ever plausible, but the owner confirms it by editing the file.
 *
 * @returns The finite value, or `undefined` when the text is not a number or is ambiguous.
 */
export function readExportNumber(text: string): number | undefined {
  const sign = text.startsWith('-') || text.startsWith('+') ? text.slice(0, 1) : '';
  const unsigned = sign === '' ? text : text.slice(1);
  if (ENGLISH_GROUPED.test(unsigned)) return parseDecimal(sign + unsigned.replaceAll(',', ''));
  if (CONTINENTAL_GROUPED.test(unsigned)) {
    return parseDecimal(sign + unsigned.replaceAll('.', '').replace(',', '.'));
  }
  if (AMBIGUOUS_COMMA.test(unsigned)) return undefined;
  if (COMMA_THOUSANDS.test(unsigned)) return parseDecimal(sign + unsigned.replaceAll(',', ''));
  return parseDecimal(sign + unsigned.replaceAll(',', '.'));
}
