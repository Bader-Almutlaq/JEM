import { Fragment, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { MUSCLE_DISPLAY_NAMES } from '../../../core/library/Muscle';
import { isMainMuscle } from '../../../core/library/MuscleProminence';
import { MuscleVolumeLimits } from '../../../core/analytics/MuscleVolume';
import type { MuscleDashboardItem } from '../../../core/queries/MuscleDashboard';
import type { AnalyticsPeriod } from './analyticsPeriod';
import styles from './Analytics.module.css';

/** Fractional sets, primary-lift changes and direct effort, ordered by sets. */
export function MuscleDashboardTable({
  muscles,
  period,
  onSelect,
}: {
  readonly muscles: readonly MuscleDashboardItem[];
  readonly period: AnalyticsPeriod;
  readonly onSelect?: (item: MuscleDashboardItem) => void;
}) {
  const [smaller, setSmaller] = useState(false);
  const navigate = useNavigate();
  // The whole row is the tap target. iOS Safari doesn't contain an absolutely positioned overlay in a table row,
  // so a stretched-link overlay escaped the row and covered the page above (every tap opened the last muscle).
  const openRow = (event: MouseEvent<HTMLTableRowElement>, item: MuscleDashboardItem) => {
    if (event.target instanceof Element && event.target.closest('a, button') !== null) return;
    if (onSelect) onSelect(item);
    else void navigate(`/analytics/muscles/${item.muscle}?period=${period}`);
  };
  const rows = [...muscles].sort((a, b) => b.setsPerWeek - a.setsPerWeek);
  const visible = rows.filter((item) => smaller || isMainMuscle(item.muscle));
  const maximum = Math.max(1, ...rows.map((item) => item.setsPerWeek));
  return (
    <section>
      <h2>Muscles</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Muscle</th>
            <th>Sets / wk</th>
            <th>Strength</th>
            <th>Effort</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((item, index) => (
            <Fragment key={item.muscle}>
              {item.setsPerWeek.toFixed(1) === '0.0' &&
                (index === 0 || (visible[index - 1]?.setsPerWeek ?? 0).toFixed(1) !== '0.0') && (
                  <tr>
                    <td colSpan={4} className={styles.divider}>
                      Not trained in this period
                    </td>
                  </tr>
                )}
              <tr
                className={`${styles.tappableRow} ${item.setsPerWeek < MuscleVolumeLimits.first ? styles.muted : ''}`}
                onClick={(event) => openRow(event, item)}
              >
                <th>
                  {onSelect ? (
                    <button className={styles.tableButton} type="button" onClick={() => onSelect(item)}>
                      {MUSCLE_DISPLAY_NAMES[item.muscle]}
                    </button>
                  ) : (
                    <Link className={styles.rowLink} to={`/analytics/muscles/${item.muscle}?period=${period}`}>
                      {MUSCLE_DISPLAY_NAMES[item.muscle]}
                    </Link>
                  )}
                </th>
                <td>
                  {item.setsPerWeek.toFixed(1)}
                  <span className={styles.miniTrack}>
                    <span style={{ width: `${(item.setsPerWeek / maximum) * 100}%` }} />
                  </span>
                </td>
                <td
                  className={
                    item.strengthChangePercent === null || item.strengthChangePercent === 0
                      ? styles.neutral
                      : item.strengthChangePercent > 0
                        ? styles.good
                        : styles.bad
                  }
                >
                  {item.strengthChangePercent === null
                    ? '—'
                    : `${item.strengthChangePercent >= 0 ? '+' : ''}${item.strengthChangePercent.toFixed(1)}%`}
                </td>
                <td>
                  {item.averageRir === null ? '—' : `${item.averageRir.toFixed(1)} RIR`}{' '}
                  <span aria-hidden="true">›</span>
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={() => setSmaller(!smaller)}>
        {smaller ? 'Hide smaller muscles' : 'Show smaller muscles'}
      </button>
    </section>
  );
}
