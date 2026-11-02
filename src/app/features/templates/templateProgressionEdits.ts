import type { TemplateDraft } from '../../../core/templates/TemplateDraft';
import type { ProgressionMode } from '../../../core/logging/ProgressionMode';

/** Sets a saved-workout preference without touching Targets. Null restores Automatic and clears legacy double. */
export function withProgression(
  draft: TemplateDraft,
  exerciseIndex: number,
  progressionMode: ProgressionMode | null,
): TemplateDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise, index) =>
      index !== exerciseIndex
        ? exercise
        : {
            ...exercise,
            progression: null,
            progressionMode,
          },
    ),
  };
}
