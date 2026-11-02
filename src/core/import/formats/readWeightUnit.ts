import type { WeightUnit } from '../../units/WeightUnit';

/** Spellings of a weight unit seen in workout exports, lower case. */
const WeightUnitLabels: Readonly<Record<string, WeightUnit>> = Object.freeze({
  kg: 'kg',
  kgs: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
});

/** The unit named by an export's unit cell (`kg`, `lbs`, …), or `undefined` when it is not a known label. */
export function readWeightUnit(text: string): WeightUnit | undefined {
  return WeightUnitLabels[text.trim().toLowerCase()];
}
