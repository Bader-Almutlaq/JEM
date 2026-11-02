import { useLocation } from 'react-router';
import type { TemplateSession } from '../../../core/queries/TemplateSessions';
import { database, useDatabaseQuery } from '../../data/database';
import { EmptyState } from '../../design/components/EmptyState';
import { dayAndTimeText } from '../../format/dateText';
import { HistoryCard } from '../history/HistoryCard';
import { sessionDurationText } from './sessionDurationText';
import styles from './PlanPage.module.css';

/** All sessions in the supplied scope as history cards; each opens the existing History entry. */
export function TemplateSessionHistory({ sessions }: { readonly sessions: readonly TemplateSession[] }) {
  const location = useLocation();
  const ids = sessions.map((session) => session.id);
  // The cards still show their totals if the exercise lines fail to load.
  const bests = useDatabaseQuery(`template-session-bests-${ids.join(',')}`, () => database.historyExerciseBests(ids));
  if (sessions.length === 0) return <EmptyState message="No sessions yet. Start a workout to record one." />;
  return (
    <div className={styles.stack}>
      {sessions.map((session) => (
        <HistoryCard
          key={session.id}
          to={`/history/${session.id}`}
          state={{ from: location.pathname + location.search }}
          name={session.name}
          dateLine={dayAndTimeText(session.startedAt)}
          duration={sessionDurationText(session.durationSeconds)}
          setCount={session.workingSetCount}
          volumeKilograms={session.volumeKilograms}
          exercises={bests.status === 'ready' ? (bests.value.get(session.id) ?? []) : []}
        />
      ))}
    </div>
  );
}
