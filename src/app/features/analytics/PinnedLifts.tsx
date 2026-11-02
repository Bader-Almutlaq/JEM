import { useState } from 'react';
import { line } from 'd3-shape';
import { Link, useLocation } from 'react-router';
import { backState } from '../../navigation/backState';
import { KILOGRAMS_PER_POUND } from '../../../core/units/WeightUnit';
import { log } from '../../../core/support/log';
import { database, messageOf, useDatabaseQuery } from '../../data/database';
import styles from './Analytics.module.css';

/** Ordered pinned exercises and history-backed suggestions. */
export function PinnedLifts({ from, to }: { readonly from: string; readonly to: string }) {
  const location = useLocation();
  const [error, setError] = useState<string>();
  const [offered, setOffered] = useState<readonly number[]>();
  const query = useDatabaseQuery(`pins-${from}-${to}`, async () => {
    const [pins, entries, ranking] = await Promise.all([
      database.pinnedExercises(),
      database.exerciseEntries(),
      database.strengthRanking(from, to),
    ]);
    const cards = await Promise.all(
      pins.map(async (pin) => ({
        pin,
        detail: await database.exerciseDetail(pin.exerciseId),
        strength: await database.exerciseStrength(pin.exerciseId),
      })),
    );
    const candidates = entries.filter(
      (entry) =>
        ['Squat (Barbell)', 'Bench Press (Barbell)', 'Deadlift (Barbell)'].includes(entry.name) && entry.usageCount > 0,
    );
    const suggestions = (
      await Promise.all(candidates.map(async (entry) => ({ entry, detail: await database.exerciseDetail(entry.id) })))
    )
      .filter(({ detail }) => detail !== null && detail.workoutCount > 0)
      .map(({ entry }) => entry);
    return { cards, suggestions, ranking };
  });
  const ready = query.status === 'ready' ? query.value : undefined;
  const unpinned =
    ready?.suggestions
      .filter((entry) => !ready.cards.some(({ pin }) => pin.exerciseId === entry.id))
      .map((entry) => entry.id) ?? [];
  // Captured at the first pin, so the chips tapped this visit keep their places and show as pinned.
  const shown = offered ?? unpinned;
  const pin = (exerciseId: number) => {
    setOffered((current) => current ?? unpinned);
    void act(() => database.pinExercise(exerciseId));
  };
  const act = async (action: () => Promise<void>) => {
    try {
      setError(undefined);
      await action();
    } catch (failure) {
      log.ui.error('Changing pinned lifts failed', failure);
      setError(messageOf(failure));
    }
  };
  return (
    <section>
      <h2>Pinned lifts</h2>
      {error !== undefined && <p role="alert">{error}</p>}
      {query.status === 'failed' && <p role="alert">{query.message}</p>}
      {query.status === 'ready' &&
        (query.value.cards.length === 0 && shown.length === 0 ? (
          <p>No pinned lifts</p>
        ) : (
          <>
            {shown.length > 0 && (
              <div className={styles.suggestions}>
                {query.value.suggestions
                  .filter((entry) => shown.includes(entry.id))
                  .map((entry) => {
                    const isPinned = query.value.cards.some(({ pin }) => pin.exerciseId === entry.id);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        disabled={isPinned}
                        aria-label={isPinned ? `${entry.name} pinned` : `Pin ${entry.name}`}
                        onClick={() => pin(entry.id)}
                      >
                        {isPinned ? '✓' : '+'} {entry.name}
                      </button>
                    );
                  })}
              </div>
            )}
            <div className={styles.pins}>
              {query.value.cards.map(({ pin, detail, strength }, index) => {
                if (detail === null) return null;
                const lift = query.value.ranking.lifts.find((item) => item.id === pin.exerciseId);
                const values = lift?.points ?? strength.trend.map((point) => point.e1rmKilograms);
                const minimum = Math.min(...values);
                const span = Math.max(...values) - minimum || 1;
                const path =
                  line<number>()
                    .x((_, i) => (i * 100) / Math.max(1, values.length - 1))
                    .y((value) => 28 - ((value - minimum) / span) * 26)(values) ?? '';
                const unit = detail.exercise.defaultEntryUnit;
                const value =
                  strength.latest === null
                    ? null
                    : unit === 'lb'
                      ? strength.latest / KILOGRAMS_PER_POUND
                      : strength.latest;
                return (
                  <article className={styles.pin} key={pin.exerciseId}>
                    <Link to={`/exercises/${pin.exerciseId}?tab=charts`} state={backState(location, 'Analytics')}>
                      {detail.exercise.name}
                    </Link>
                    <small className={styles.quiet}>Est. 1RM now</small>
                    <p>
                      {value === null ? '—' : `${value.toFixed(1)} ${unit}`}{' '}
                      {lift !== undefined && (
                        <span
                          className={
                            lift.changePercent > 0 ? styles.good : lift.changePercent < 0 ? styles.bad : styles.neutral
                          }
                        >
                          {lift.changePercent >= 0 ? '+' : ''}
                          {lift.changePercent.toFixed(1)}%
                        </span>
                      )}
                    </p>
                    <svg viewBox="0 0 100 30" aria-hidden="true">
                      <path d={path} fill="none" stroke="currentColor" />
                      {values.length > 0 && (
                        <circle
                          cx={values.length === 1 ? 0 : 100}
                          cy={28 - (((values.at(-1) ?? minimum) - minimum) / span) * 26}
                          r="2.5"
                          fill="currentColor"
                        />
                      )}
                    </svg>
                    <details>
                      <summary>
                        ⋯<span className={styles.srOnly}> Options</span>
                      </summary>
                      <button type="button" onClick={() => void act(() => database.unpinExercise(pin.exerciseId))}>
                        Unpin
                      </button>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => void act(() => database.movePinnedExercise(pin.exerciseId, 'up'))}
                      >
                        Move left
                      </button>
                      <button
                        type="button"
                        disabled={index === query.value.cards.length - 1}
                        onClick={() => void act(() => database.movePinnedExercise(pin.exerciseId, 'down'))}
                      >
                        Move right
                      </button>
                    </details>
                  </article>
                );
              })}
            </div>
          </>
        ))}
    </section>
  );
}
