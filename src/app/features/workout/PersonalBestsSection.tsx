import type { PersonalBest } from '../../../core/queries/PersonalBests';
import { personalBestParts } from '../../format/workoutComparisonText';
import { Section, SectionRow } from '../../design/components/Section';

/** Personal records set in this workout, one row each: the exercise and kind of record, the new value and the old one. */
export function PersonalBestsSection({ bests }: { readonly bests: readonly PersonalBest[] }) {
  if (bests.length === 0) return null;
  return (
    <Section label="Personal bests">
      {bests.map((best, index) => {
        const parts = personalBestParts(best);
        return (
          <SectionRow
            key={`${best.exercise.id}-${best.kind}-${index}`}
            label={parts.exercise}
            detail={parts.label}
            value={parts.value}
            valueDetail={parts.previous}
          />
        );
      })}
    </Section>
  );
}
