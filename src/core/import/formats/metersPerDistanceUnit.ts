import { WorkoutFileUnits } from './WorkoutFileUnits';

/** Meters in one of the distance units named by an export's unit cell, lower case. */
const DistanceUnitMeters: Readonly<Record<string, number>> = Object.freeze({
  m: 1,
  meter: 1,
  meters: 1,
  km: WorkoutFileUnits.metersPerKilometer,
  kilometer: WorkoutFileUnits.metersPerKilometer,
  kilometers: WorkoutFileUnits.metersPerKilometer,
  mi: WorkoutFileUnits.metersPerMile,
  mile: WorkoutFileUnits.metersPerMile,
  miles: WorkoutFileUnits.metersPerMile,
});

/** Meters per unit for an export's distance unit (`km`, `Miles`, …), or `undefined` when it is not a known label. */
export function metersPerDistanceUnit(text: string): number | undefined {
  return DistanceUnitMeters[text.trim().toLowerCase()];
}
