import type { PersonalBest } from '../../../core/queries/PersonalBests';
import { personalBestParts } from '../../format/workoutComparisonText';
import { SummaryCard, SummaryRow } from './SummaryCard';

/** Personal records set in this workout, one row each: the exercise and kind of record, the new value and the old one. */
export function PersonalBestsSection({ bests }: { readonly bests: readonly PersonalBest[] }) {
  if (bests.length === 0) return null;
  return (
    <SummaryCard title="Personal bests">
      {bests.map((best, index) => {
        const parts = personalBestParts(best);
        return (
          <SummaryRow
            key={`${best.exercise.id}-${best.kind}-${index}`}
            label={parts.exercise}
            detail={parts.label}
            value={parts.value}
            valueDetail={parts.previous}
          />
        );
      })}
    </SummaryCard>
  );
}
