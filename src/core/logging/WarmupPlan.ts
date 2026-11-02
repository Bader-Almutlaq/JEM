import type { Exercise } from '../models/Exercise';
import { roundToLoadable, type LoadProfile } from '../units/LoadableWeight';
import { WeightTolerance } from '../units/Weight';

/** A suggested warm-up, with exact kg load and whole reps. Never a completed set. */
export interface WarmupSuggestion {
  readonly weightKilograms: number;
  readonly reps: number;
}

/** Heuristic: Ribeiro 2021, Motricidade warm-up review supports specific warm-ups near working loads (40–80% studied); exact schemes are owner-approved, not prescriptions. */
export const WarmupSchemes: Readonly<Record<number, readonly (readonly [fraction: number, reps: number])[]>> = {
  0: [],
  1: [[0.6, 6]],
  2: [
    [0.5, 8],
    [0.75, 3],
  ],
  3: [
    [0.4, 8],
    [0.6, 5],
    [0.8, 2],
  ],
  4: [
    [0.4, 8],
    [0.55, 5],
    [0.7, 3],
    [0.85, 1],
  ],
};

/** Heuristic: owner-approved defaults (T-044); unknown classification gets none rather than guessing. */
const WarmupDefaults = {
  heavyCompound: 3,
  compound: 2,
  isolation: 1,
  none: 0,
  heavyPatterns: new Set(['squat', 'hinge', 'horizontal-push', 'vertical-push', 'horizontal-pull', 'vertical-pull']),
} as const;

/** The shared big-lift classification: a loaded barbell compound in a known major movement pattern. Heuristic: owner-approved warm-up groups (T-044). */
export function isBigBarbellCompound(
  exercise: Pick<Exercise, 'equipment' | 'tracking' | 'mechanic' | 'movementPattern'>,
): boolean {
  return (
    exercise.tracking === 'weight-reps' &&
    exercise.equipment === 'barbell' &&
    exercise.mechanic === 'compound' &&
    exercise.movementPattern !== null &&
    WarmupDefaults.heavyPatterns.has(exercise.movementPattern)
  );
}

/** Heuristic default count by exercise kind; timed and bodyweight exercises suggest none. */
export function suggestedWarmupCount(
  exercise: Pick<Exercise, 'equipment' | 'tracking' | 'mechanic' | 'movementPattern'>,
): number {
  if (exercise.equipment === 'bodyweight' || exercise.equipment === 'band' || exercise.tracking !== 'weight-reps')
    return WarmupDefaults.none;
  if (exercise.mechanic === 'compound') {
    return isBigBarbellCompound(exercise) ? WarmupDefaults.heavyCompound : WarmupDefaults.compound;
  }
  return exercise.mechanic === 'isolation' ? WarmupDefaults.isolation : WarmupDefaults.none;
}

/**
 * How many warm-ups an exercise gets automatically: its own count when the owner set one (0 turns them off for
 * that exercise), otherwise the heuristic default for its kind (`suggestedWarmupCount`). Owner decision 2026-11-02:
 * warm-ups are always suggested, never opt-in; they only ever fill untouched slots.
 */
export function automaticWarmupCount(
  exercise: Pick<Exercise, 'equipment' | 'tracking' | 'mechanic' | 'movementPattern' | 'warmupSetCount'>,
): number {
  return exercise.warmupSetCount ?? suggestedWarmupCount(exercise);
}

/** Rounds the scheme down, keeps the first duplicate only, and excludes loads at/above work; zero work or invalid counts produce none. */
export function warmupSets(firstWorkingKilograms: number, count: number, profile: LoadProfile): WarmupSuggestion[] {
  if (!Number.isFinite(firstWorkingKilograms) || firstWorkingKilograms <= 0) return [];
  const result: WarmupSuggestion[] = [];
  for (const [fraction, reps] of WarmupSchemes[count] ?? []) {
    const weightKilograms = roundToLoadable(firstWorkingKilograms * fraction, profile, 'down');
    if (weightKilograms >= firstWorkingKilograms - WeightTolerance.floatingPoint) continue;
    if (result.some((set) => Math.abs(set.weightKilograms - weightKilograms) <= WeightTolerance.floatingPoint))
      continue;
    result.push({ weightKilograms, reps });
  }
  return result;
}

/** Existing warm-up slot: protected sets retain every stored field via their id. */
export interface WarmupSlot extends WarmupSuggestion {
  readonly id: number;
  readonly isCompleted: boolean;
}

/** A reconciled suggestion; null id requests an insert, an existing id requests preservation/update. */
export interface RefreshedWarmup extends WarmupSuggestion {
  readonly id: number | null;
}

/** Replans only uncompleted, unedited slots; protected slots occupy their original scheme index. Drops obsolete suggestions, never duplicates protected loads. */
export function refreshWarmups(
  existing: readonly WarmupSlot[],
  planned: readonly WarmupSuggestion[],
  editedSetIds: ReadonlySet<number>,
): RefreshedWarmup[] {
  const protectedSets = existing.filter((set) => set.isCompleted || editedSetIds.has(set.id));
  const result: RefreshedWarmup[] = [];
  const length = Math.max(existing.length, planned.length);
  for (let index = 0; index < length; index += 1) {
    const old = existing[index];
    if (old !== undefined && (old.isCompleted || editedSetIds.has(old.id))) {
      result.push(old);
      continue;
    }
    const next = planned[index];
    if (next === undefined) continue;
    if (
      [...protectedSets, ...result].some(
        (set) => Math.abs(set.weightKilograms - next.weightKilograms) <= WeightTolerance.floatingPoint,
      )
    )
      continue;
    result.push({ ...next, id: old?.id ?? null });
  }
  return result;
}
