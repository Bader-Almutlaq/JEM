import { localDateKey } from '../support/localDate';
import { HardSetPolicy, isHardSet } from '../analytics/HardSets';
import { muscleVolume, type MuscleVolume, type MuscleVolumeSet } from '../analytics/MuscleVolume';
import type { Database } from '../db/Database';
import { AnalyticsHistory } from './AnalyticsHistory';

/** The Monday local date and fractional hard sets for all muscles, including muscles with zero sets. */
export interface WeeklyMuscleVolume {
  readonly weekStart: string;
  readonly muscles: readonly MuscleVolume[];
}

/** Heuristic: civil-calendar constants for Monday-based weeks, matching the History calendar's local dates. */
const CalendarWeek = Object.freeze({ days: 7, monday: 1, sunday: 0 });

/** An invalid date prevents a local calendar week from being selected. */
export class WeeklyMuscleVolumeError extends Error {
  readonly kind = 'invalidDate';

  /** Ask for valid range endpoints before reading the database. */
  constructor() {
    super('Choose valid start and end dates for weekly muscle volume.');
    this.name = 'WeeklyMuscleVolumeError';
  }
}

function mondayOf(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = monday.getDay();
  monday.setDate(
    monday.getDate() - (weekday === CalendarWeek.sunday ? CalendarWeek.days : weekday) + CalendarWeek.monday,
  );
  return monday;
}

/**
 * Finished workouts grouped by their start's local Monday week, from the week containing `from`
 * through the week containing `to`, inclusive. Returns zero-filled weeks and muscles; a reversed
 * range returns []. Calendar increments preserve local weeks across daylight-saving changes.
 * When clipToDates is true, partial weeks include only the inclusive selected dates.
 * Imported workouts without an end/completion timestamp still count; planned sets never count.
 * Fractional counting and zones are delegated to muscleVolume (research report, item 10).
 */
export function weeklyMuscleVolume(
  db: Database,
  from: Date,
  to: Date,
  secondaryWeight: number = HardSetPolicy.secondaryWeight,
  clipToDates: boolean = false,
): WeeklyMuscleVolume[] {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) throw new WeeklyMuscleVolumeError();
  if (from > to) return [];
  const firstMonday = mondayOf(from);
  const lastMonday = mondayOf(to);
  const end = new Date(lastMonday);
  end.setDate(end.getDate() + CalendarWeek.days);
  const queryStart = clipToDates ? new Date(from.getFullYear(), from.getMonth(), from.getDate()) : firstMonday;
  const queryEnd = clipToDates ? new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1) : end;
  const rows = AnalyticsHistory.sets(db, queryStart, queryEnd);
  const associations = AnalyticsHistory.muscles(db);
  const weeks = new Map<string, MuscleVolumeSet[]>();
  // A workout's date is shared by all its sets; avoid parsing it once per muscle association.
  const workoutWeeks = new Map<number, string>();
  for (const row of rows) {
    if (!isHardSet({ ...row, isCompleted: true })) continue;
    let weekStart = workoutWeeks.get(row.workoutId);
    if (weekStart === undefined) {
      weekStart = localDateKey(mondayOf(new Date(row.startedAt)));
      workoutWeeks.set(row.workoutId, weekStart);
    }
    const sets = weeks.get(weekStart) ?? [];
    for (const association of associations.get(row.exerciseId) ?? []) {
      sets.push({ workoutId: row.workoutId, kind: row.kind, rpe: row.rpe, ...association, isCompleted: true });
    }
    weeks.set(weekStart, sets);
  }
  const result: WeeklyMuscleVolume[] = [];
  for (
    const monday = new Date(firstMonday);
    monday <= lastMonday;
    monday.setDate(monday.getDate() + CalendarWeek.days)
  ) {
    const weekStart = localDateKey(monday);
    result.push({ weekStart, muscles: muscleVolume(weeks.get(weekStart) ?? [], secondaryWeight) });
  }
  return result;
}
