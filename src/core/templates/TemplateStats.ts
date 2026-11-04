import type { TemplateDraft } from './TemplateDraft';

/** What the editor shows at the top while a workout is built; it changes with every set added or removed. */
export interface TemplateStats {
  readonly exercises: number;
  /** Planned sets that are not warm-ups. */
  readonly workingSets: number;
  readonly warmupSets: number;
  /** Mean of the target RPEs of working sets that have one (a range counts as its midpoint), or `null` when none does. */
  readonly averageRpe: number | null;
}

/**
 * Counts a draft's exercises and sets and averages its planned effort. Describes the plan; never judges it.
 *
 * Heuristic: the average is a plain mean of each working set's target RPE, with a range (`8–10`) counted as its
 * midpoint. It summarises what the owner wrote, as a quick read of how hard the session is planned; it is not a
 * training-load measure, so no research formula applies.
 */
export function templateStats(draft: TemplateDraft): TemplateStats {
  let workingSets = 0;
  let warmupSets = 0;
  const efforts: number[] = [];
  for (const exercise of draft.exercises) {
    for (const set of exercise.sets) {
      if (set.kind === 'warmup') {
        warmupSets += 1;
        continue;
      }
      workingSets += 1;
      if (set.targetRpe !== null) efforts.push((set.targetRpe + (set.targetRpeHigh ?? set.targetRpe)) / 2);
    }
  }
  return {
    exercises: draft.exercises.length,
    workingSets,
    warmupSets,
    averageRpe: efforts.length === 0 ? null : efforts.reduce((sum, value) => sum + value, 0) / efforts.length,
  };
}
