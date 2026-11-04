import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { database, useDatabaseQuery } from './data/database';
import { TabBar } from './design/components/TabBar';
import { DropboxRestoreSheet } from './features/settings/DropboxRestoreSheet';
import { ResumeWorkoutBar } from './features/workout/ResumeWorkoutBar';
import { useWorkoutMinimized } from './features/workout/workoutMinimized';

/**
 * The bars around every screen. While the workout in progress fills the Workout tab the tab bar is hidden, so
 * a stray tap cannot leave it; swiping the workout down (or its chevron) reveals the tabs, with a strip to resume.
 * Elsewhere, a workout in progress is one tap away in that strip.
 */
export function AppChrome() {
  const { pathname } = useLocation();
  // A one-row read: this bar is on every screen, so it must not re-read the whole live workout after each write.
  const live = useDatabaseQuery('active-workout-summary', () => database.activeWorkoutSummary());
  const workout = live.status === 'ready' ? (live.value ?? undefined) : undefined;
  const minimized = useWorkoutMinimized(workout?.id);
  const isWorkoutScreen = workout !== undefined && pathname === '/' && !minimized;

  // Screens and bars that sit above the tab bar read this (tokens.css).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset['tabs'] = isWorkoutScreen ? 'hidden' : 'shown';
    root.dataset['resume'] = workout !== undefined && !isWorkoutScreen ? 'shown' : 'hidden';
  }, [isWorkoutScreen, workout]);

  // The Dropbox restore sheet is mounted here once: it can be opened from Settings or the empty-phone card, and a
  // restore in progress keeps showing whichever screen started it.
  if (isWorkoutScreen) return <DropboxRestoreSheet />;
  return (
    <>
      {workout !== undefined && <ResumeWorkoutBar name={workout.name} startedAt={workout.startedAt} />}
      <TabBar />
      <DropboxRestoreSheet />
    </>
  );
}
