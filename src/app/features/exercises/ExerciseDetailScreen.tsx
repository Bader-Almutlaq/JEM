import { useLocation, useParams, useSearchParams } from 'react-router';
import { backTarget } from '../../navigation/backState';
import { database, useDatabaseQuery } from '../../data/database';
import { BackLink } from '../../design/components/BackLink';
import { EmptyState } from '../../design/components/EmptyState';
import { Screen } from '../../design/components/Screen';
import { SegmentedControl } from '../../design/components/SegmentedControl';
import { exercisePageTab, exercisePageTabParams, exercisePageTabs } from './exercisePageTabs';
import { ExerciseSummaryTab } from './ExerciseSummaryTab';
import { ExerciseHistoryTab } from './ExerciseHistoryTab';
import { ExerciseChartsTab } from './ExerciseChartsTab';
import { ExerciseRecordsTab } from './ExerciseRecordsTab';
import { ExerciseHowToTab } from './ExerciseHowToTab';
import { ExerciseQueryMessage } from './ExerciseQueryMessage';
import styles from './ExerciseDetailScreen.module.css';

/** Exercise sections selected by URL; mounting only the active section defers its queries and picture loads. */
export function ExerciseDetailScreen() {
  const exerciseId = Number(useParams().exerciseId);
  const [params, setParams] = useSearchParams();
  const tab = exercisePageTab(params);
  const detail = useDatabaseQuery(`exercise-${exerciseId}`, () => database.exerciseDetail(exerciseId));
  const target = backTarget(useLocation().state, { to: '/exercises', label: 'Exercises' });
  const back = <BackLink to={target.to} label={target.label} state={target.state} />;
  if (detail.status !== 'ready' || detail.value === null) {
    return (
      <Screen title="Exercise" leading={back}>
        {detail.status === 'ready' ? (
          <EmptyState message="This exercise no longer exists." />
        ) : (
          <ExerciseQueryMessage query={detail} />
        )}
      </Screen>
    );
  }
  const { exercise } = detail.value;
  return (
    <Screen title={exercise.name} leading={back}>
      <div className={styles.tabs}>
        <SegmentedControl
          label="Exercise sections"
          options={exercisePageTabs}
          value={tab}
          onChange={(next) => setParams(exercisePageTabParams(params, next))}
        />
      </div>
      {exercise.isArchived && <p className={styles.note}>Archived: hidden from search and lists. History is kept.</p>}
      <div className={styles.tabContent} key={`${exerciseId}-${tab}`}>
        {tab === 'summary' && <ExerciseSummaryTab detail={detail.value} />}
        {tab === 'history' && <ExerciseHistoryTab exerciseId={exerciseId} tracking={exercise.tracking} />}
        {tab === 'charts' && (
          <ExerciseChartsTab
            exerciseId={exerciseId}
            tracking={exercise.tracking}
            unit={exercise.defaultEntryUnit}
            machine={params.get('machine')}
            onMachine={(value) => {
              const next = new URLSearchParams(params);
              if (value === null) next.delete('machine');
              else next.set('machine', value);
              setParams(next);
            }}
          />
        )}
        {tab === 'records' && (
          <ExerciseRecordsTab exerciseId={exerciseId} unit={exercise.defaultEntryUnit} tracking={exercise.tracking} />
        )}
        {tab === 'how-to' && <ExerciseHowToTab exercise={exercise} />}
      </div>
    </Screen>
  );
}
