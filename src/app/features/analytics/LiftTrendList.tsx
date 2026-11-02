import { LiftTrendPolicy, type LiftTrend } from '../../../core/queries/LiftTrends';
import { KILOGRAMS_PER_POUND } from '../../../core/units/WeightUnit';
import { LiftRow } from './LiftRow';

/** Ranked lift trends, in each exercise's display unit, linking to its Charts tab. */
export function LiftTrendList({ lifts }: { readonly lifts: readonly LiftTrend[] }) {
  if (lifts.length === 0) return <p>Log at least 2 sessions of a lift in this period to see its trend.</p>;
  return (
    <div>
      {lifts.map((lift) => {
        const value = lift.unit === 'lb' ? lift.latest / KILOGRAMS_PER_POUND : lift.latest;
        return (
          <LiftRow
            key={lift.id}
            to={`/exercises/${lift.id}?tab=charts`}
            backLabel="Analytics"
            name={lift.name}
            value={`${value.toFixed(1)} ${lift.unit}`}
            change={lift.changePercent}
            points={lift.points.map((point) => ({ value: point, deload: false }))}
            detail={
              <>
                {lift.mixedMachines && <small>mixed machines</small>}
                {lift.weeksSinceBest !== undefined && lift.weeksSinceBest >= LiftTrendPolicy.staleWeeks && (
                  <small>no new best in 6 wk</small>
                )}
              </>
            }
          />
        );
      })}
    </div>
  );
}
