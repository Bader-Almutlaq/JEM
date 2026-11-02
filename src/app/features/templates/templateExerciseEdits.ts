import type { TemplateDraft, TemplateExerciseDraft } from '../../../core/templates/TemplateDraft';
import { BLANK_SET } from './templateSetEdits';

/** A draft for a template that doesn't exist yet. */
export const NEW_TEMPLATE_DRAFT: TemplateDraft = { name: '', folderId: null, notes: null, exercises: [] };

/**
 * Makes superset groups well-formed: a group of one exercise is no group, and the numbers run 1, 2,
 * 3… in the order the groups appear. Group numbers only identify which exercises belong together.
 */
function tidied(exercises: readonly TemplateExerciseDraft[]): TemplateExerciseDraft[] {
  const sizes = new Map<number, number>();
  for (const { supersetGroup } of exercises)
    if (supersetGroup !== null) sizes.set(supersetGroup, (sizes.get(supersetGroup) ?? 0) + 1);
  const renumbered = new Map<number, number>();
  return exercises.map((exercise) => {
    const group = exercise.supersetGroup;
    if (group === null || (sizes.get(group) ?? 0) < 2) return { ...exercise, supersetGroup: null };
    if (!renumbered.has(group)) renumbered.set(group, renumbered.size + 1);
    return { ...exercise, supersetGroup: renumbered.get(group) ?? null };
  });
}

function freshGroup(exercises: readonly TemplateExerciseDraft[]): number {
  return Math.max(0, ...exercises.map((exercise) => exercise.supersetGroup ?? 0)) + 1;
}

function withExercises(draft: TemplateDraft, exercises: readonly TemplateExerciseDraft[]): TemplateDraft {
  return { ...draft, exercises: tidied(exercises) };
}

/** Appends exercises in the order given, each with one blank set. */
export function withExercisesAdded(draft: TemplateDraft, exerciseIds: readonly number[]): TemplateDraft {
  const added = exerciseIds.map((exerciseId): TemplateExerciseDraft => ({
    exerciseId,
    supersetGroup: null,
    notes: null,
    sets: [BLANK_SET],
  }));
  return withExercises(draft, [...draft.exercises, ...added]);
}

/** Removes the exercise; a superset it leaves with one member is dissolved. */
export function withExerciseRemoved(draft: TemplateDraft, index: number): TemplateDraft {
  return withExercises(
    draft,
    draft.exercises.filter((_, position) => position !== index),
  );
}

/** The index of the first or last exercise of the superset `group`. */
function groupEdge(exercises: readonly TemplateExerciseDraft[], group: number, edge: 'first' | 'last'): number {
  const members = exercises.flatMap((exercise, index) => (exercise.supersetGroup === group ? [index] : []));
  return (edge === 'first' ? members[0] : members.at(-1)) ?? 0;
}

/**
 * Moves an exercise one place up (`-1`) or down (`1`). A superset stays together: moving past a
 * whole superset jumps over it, and moving past the end of its own superset takes the exercise out of it.
 */
export function withExerciseMoved(draft: TemplateDraft, index: number, direction: 1 | -1): TemplateDraft {
  const exercises = draft.exercises;
  const moving = exercises[index];
  const neighbour = exercises[index + direction];
  if (moving === undefined || neighbour === undefined) return draft;
  const crossesGroup = neighbour.supersetGroup !== null && neighbour.supersetGroup !== moving.supersetGroup;
  const destination =
    crossesGroup && neighbour.supersetGroup !== null
      ? groupEdge(exercises, neighbour.supersetGroup, direction === 1 ? 'last' : 'first')
      : index + direction;
  const leavesGroup = moving.supersetGroup !== null && neighbour.supersetGroup !== moving.supersetGroup;
  const reordered = exercises.filter((_, position) => position !== index);
  reordered.splice(destination, 0, leavesGroup ? { ...moving, supersetGroup: null } : moving);
  return withExercises(draft, reordered);
}

/** Whether the exercise and the one after it are in the same superset. */
export function isSupersetWithNext(draft: TemplateDraft, index: number): boolean {
  const group = draft.exercises[index]?.supersetGroup ?? null;
  return group !== null && draft.exercises[index + 1]?.supersetGroup === group;
}

/**
 * Joins the exercise to the one after it in a superset, or splits them again when they already are
 * one. Joining a superset to another merges both. Splitting keeps the earlier exercises together
 * and moves the later ones into their own superset (dissolved if only one is left).
 */
export function withSupersetToggled(draft: TemplateDraft, index: number): TemplateDraft {
  const exercises = draft.exercises;
  const current = exercises[index];
  const next = exercises[index + 1];
  if (current === undefined || next === undefined) return draft;
  const group = current.supersetGroup;
  const fresh = freshGroup(exercises);
  if (isSupersetWithNext(draft, index))
    return withExercises(
      draft,
      exercises.map((exercise, position) =>
        position > index && exercise.supersetGroup === group ? { ...exercise, supersetGroup: fresh } : exercise,
      ),
    );
  const joined = current.supersetGroup ?? fresh;
  return withExercises(
    draft,
    exercises.map((exercise, position) => {
      const isNextBlock =
        position === index + 1 || (next.supersetGroup !== null && exercise.supersetGroup === next.supersetGroup);
      return position === index || isNextBlock ? { ...exercise, supersetGroup: joined } : exercise;
    }),
  );
}

/**
 * Moves an exercise to `target` by taking the same one-place steps as Move up / Move down, so a superset
 * keeps its rules (a whole superset is jumped over, leaving one splits). It stops early when a step changes nothing.
 */
export function withExerciseMovedTo(draft: TemplateDraft, index: number, target: number): TemplateDraft {
  let current = draft;
  let position = index;
  const direction = target > index ? 1 : -1;
  // A step can jump a whole superset, so the exercise is followed by its sets array, which every step keeps.
  while (position !== target && (direction === 1 ? position < target : position > target)) {
    const moving = current.exercises[position];
    if (moving === undefined) break;
    const next = withExerciseMoved(current, position, direction);
    if (next === current) break;
    position = next.exercises.findIndex((exercise) => exercise.sets === moving.sets);
    current = next;
  }
  return current;
}
