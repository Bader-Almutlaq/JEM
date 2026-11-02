import { StrengthIndexPolicy } from '../../../core/analytics/StrengthIndex';
import { useState } from 'react';
import type { strengthIndexReport } from '../../../core/queries/LiftTrends';
import { TimeChart } from '../../design/charts/TimeChart';
import { LiftTrendList } from './LiftTrendList';
import { StrengthExplanation } from './StrengthExplanation';
import styles from './Analytics.module.css';

/** Heuristic: eight ranked rows fit the phone overview before the owner opts to see all. */
const policy = Object.freeze({ initialLifts: 8 });

/** Typical lift change, direction counts, weekly relative index and the period-ranked lifts. */
export function StrengthSection({
  ranking,
  weeks,
}: {
  readonly ranking: ReturnType<typeof strengthIndexReport>;
  readonly weeks: number;
}) {
  const [all, setAll] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const median = ranking.medianChangePercent;
  const counts = ranking.counts;
  return (
    <section>
      <div className={styles.strengthHeading}>
        <h2>Strength</h2>
        <button
          className={styles.info}
          type="button"
          aria-label="About typical lift change"
          onClick={() => setExplaining(true)}
        >
          ⓘ
        </button>
      </div>
      {median === null ? (
        <p>Not enough lift history in this period.</p>
      ) : (
        <div className={styles.strengthHeadline}>
          <div className={styles.typicalLift}>
            <strong
              className={
                median > StrengthIndexPolicy.flatChangePercent
                  ? styles.good
                  : median < -StrengthIndexPolicy.flatChangePercent
                    ? styles.bad
                    : styles.neutral
              }
            >
              {median >= 0 ? '+' : ''}
              {median.toFixed(1)}%
            </strong>
            <span>Typical lift</span>
            <small>Over {weeks} weeks</small>
          </div>
          <div className={styles.strengthCounts}>
            <span className={styles.good} role="img" aria-label={`${counts.up} lifts up`}>
              ▲ {counts.up}
            </span>
            <span className={styles.neutral} role="img" aria-label={`${counts.flat} lifts flat`}>
              ▬ {counts.flat}
            </span>
            <span className={styles.bad} role="img" aria-label={`${counts.down} lifts down`}>
              ▼ {counts.down}
            </span>
          </div>
        </div>
      )}
      {ranking.points.length > 0 && (
        <TimeChart
          title="Strength index"
          unit="%"
          kind="line"
          trend
          aggregation="last"
          series={[
            {
              name: 'Strength index',
              points: ranking.points.map((point) => ({ date: point.date, value: point.changePercent })),
            },
          ]}
          formatValue={(value) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`}
        />
      )}
      <LiftTrendList lifts={all ? ranking.lifts : ranking.lifts.slice(0, policy.initialLifts)} />
      {ranking.lifts.length > policy.initialLifts && (
        <button type="button" onClick={() => setAll(!all)}>
          {all ? 'Show less' : 'Show all'}
        </button>
      )}
      {explaining && <StrengthExplanation onClose={() => setExplaining(false)} />}
    </section>
  );
}
