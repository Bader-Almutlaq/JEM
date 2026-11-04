import { database, useDatabaseQuery } from '../../data/database';
import { EmptyState } from '../../design/components/EmptyState';
import { Screen } from '../../design/components/Screen';
import { ActiveWorkout } from './ActiveWorkout';
import { StartWorkout } from './StartWorkout';
import { useWorkoutMinimized } from './workoutMinimized';
import { RestoreWorkoutScreen } from './RestoreWorkoutScreen';
import { DropboxRestoreSheet } from '../settings/DropboxRestoreSheet';

/**
 * The Workout tab. While a workout is in progress it is the logging screen, and it stays so after
 * the app is closed and reopened; otherwise it offers to start one.
 */
export function WorkoutScreen() {
  const live = useDatabaseQuery('live-workout', () => database.liveWorkout());
  const minimized = useWorkoutMinimized();
  if (live.status === 'loading')
    return (
      <Screen title="Workout">
        <EmptyState message="Loading…" />
      </Screen>
    );
  if (live.status === 'failed')
    return (
      <Screen title="Workout">
        <EmptyState message={live.message} />
      </Screen>
    );
  return (
    <>
      {live.value === null ? (
        <NoWorkoutScreen />
      ) : minimized ? (
        <StartWorkout hasActiveWorkout />
      ) : (
        <ActiveWorkout key={live.value.workout.id} snapshot={live.value} />
      )}
      <DropboxRestoreSheet />
    </>
  );
}

/**
 * The Workout tab with nothing in progress: the restore screen on an empty phone, otherwise the start screen.
 * It owns the emptiness check so the check is not re-run after every logged set while a workout is live.
 */
function NoWorkoutScreen() {
  const empty = useDatabaseQuery('database-empty', () => database.isDatabaseEmpty());
  return (
    <>
      {empty.status === 'ready' && empty.value ? <RestoreWorkoutScreen /> : <StartWorkout />}
      {empty.status === 'failed' && <p role="alert">{empty.message}</p>}
    </>
  );
}
