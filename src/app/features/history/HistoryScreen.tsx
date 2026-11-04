import { groupWorkoutsByMonth } from '../../../core/queries/WorkoutMonthGroups';
import { database, useDatabaseQuery } from '../../data/database';
import { EmptyState } from '../../design/components/EmptyState';
import { Screen } from '../../design/components/Screen';
import { dayAndTimeText, durationText, monthLabel } from '../../format/dateText';
import { HistoryCard } from './HistoryCard';
import styles from './HistoryScreen.module.css';
import { HistoryCalendar } from './HistoryCalendar';
import calendarStyles from './HistoryCalendar.module.css';

/** Every finished workout, newest first, grouped by month. Tapping one opens `WorkoutDetailScreen`. */
export function HistoryScreen() {
  const history = useDatabaseQuery('history-summaries', async () => ({
    groups: groupWorkoutsByMonth(await database.historySummaries()),
    counts: await database.personalBestCounts(),
    bests: await database.historyExerciseBests(),
  }));

  return (
    <Screen title="History">
      <HistoryCalendar />
      {history.status === 'loading' && <EmptyState message="Loading…" />}
      {history.status === 'failed' && <EmptyState message={history.message} />}
      {history.status === 'ready' && history.value.groups.length === 0 && (
        <EmptyState message="Import your Strong history from Settings." />
      )}
      {history.status === 'ready' &&
        history.value.groups.map((group) => (
          <section
            key={`${group.year}-${group.month}`}
            className={styles.month}
            aria-labelledby={`history-month-${group.year}-${group.month}`}
          >
            <h2 id={`history-month-${group.year}-${group.month}`} className={styles.monthLabel}>
              {monthLabel(group.year, group.month)}
            </h2>
            {group.workouts.map((workout) => (
              <div key={workout.id} id={`history-workout-${workout.id}`} className={calendarStyles.historyAnchor}>
                <HistoryCard
                  to={`/history/${workout.id}`}
                  name={workout.name}
                  dateLine={dayAndTimeText(workout.startedAt)}
                  duration={durationText(workout.startedAt, workout.endedAt)}
                  setCount={workout.setCount}
                  warmupCount={workout.warmupCount ?? 0}
                  volumeKilograms={workout.volumeKilograms}
                  bestsCount={history.value.counts[workout.id] ?? 0}
                  exercises={history.value.bests.get(workout.id) ?? []}
                />
              </div>
            ))}
          </section>
        ))}
    </Screen>
  );
}
