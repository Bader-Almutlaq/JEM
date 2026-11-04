import type { WorkoutComparison } from '../../../core/queries/WorkoutComparison';
import { durationText } from '../../format/dateText';
import { estimateText } from '../../format/estimateText';
import { topSetChangeText, volumeChangeText } from '../../format/workoutComparisonText';
import { Section, SectionRow } from '../../design/components/Section';

/** Descriptive totals, top sets and exercise changes versus the previous matching workout, as two cards. */
export function WorkoutComparisonSection({ comparison }: { readonly comparison: WorkoutComparison | null }) {
  if (comparison === null) return null;
  const before = durationText(comparison.previous.workout.startedAt, comparison.previous.workout.endedAt) ?? '—';
  const now = durationText(comparison.current.workout.startedAt, comparison.current.workout.endedAt) ?? '—';
  const changed = comparison.exercises.filter(
    ({ previous, current, previousEstimate, currentEstimate }) =>
      (previous !== null && current !== null) || (previousEstimate !== null && currentEstimate !== null),
  );
  return (
    <>
      <Section label="Compared with last time">
        <SectionRow label="Duration" value={`${before} → ${now}`} />
        <SectionRow label="Working sets" value={`${comparison.previousSetCount} → ${comparison.currentSetCount}`} />
        <SectionRow label="Volume" value={volumeChangeText(comparison.currentVolume, comparison.previousVolume)} />
        {comparison.added.map((name) => (
          <SectionRow key={`added-${name}`} label={name} value="New today" />
        ))}
        {comparison.removed.map((name) => (
          <SectionRow key={`removed-${name}`} label={name} value="Not done today" />
        ))}
      </Section>
      {changed.length > 0 && (
        <Section label="Exercise changes">
          {changed.map(({ exercise, previous, current, previousEstimate, currentEstimate }) => (
            <SectionRow
              key={exercise.id}
              label={exercise.name}
              value={
                previous !== null && current !== null
                  ? topSetChangeText(previous, current, exercise.defaultEntryUnit)
                  : ''
              }
              {...(previousEstimate !== null && currentEstimate !== null
                ? {
                    valueDetail: `e1RM ${estimateText(previousEstimate, exercise.defaultEntryUnit)} → ${estimateText(currentEstimate, exercise.defaultEntryUnit)}`,
                  }
                : {})}
            />
          ))}
        </Section>
      )}
    </>
  );
}
