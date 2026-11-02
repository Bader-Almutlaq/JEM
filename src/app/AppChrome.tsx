import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { database, useDatabaseQuery } from './data/database';
import { TabBar } from './design/components/TabBar';
import { ResumeWorkoutBar } from './features/workout/ResumeWorkoutBar';
import { resumeWorkout, useWorkoutMinimized } from './features/workout/workoutMinimized';

/**
 * The bars around every screen. While the workout in progress fills the Workout tab the tab bar is hidden, so
 * a stray tap cannot leave it; swiping the workout down (or its chevron) reveals the tabs, with a strip to resume.
 * Elsewhere, a workout in progress is one tap away in that strip.
 */
export function AppChrome() {
  const { pathname } = useLocation();
  const live = useDatabaseQuery('live-workout', () => database.liveWorkout());
  const minimized = useWorkoutMinimized();
  const workout = live.status === 'ready' ? live.value?.workout : undefined;
  const isWorkoutScreen = workout !== undefined && pathname === '/' && !minimized;

  // A finished or discarded workout leaves nothing to resume; the next one starts on screen.
  useEffect(() => {
    if (live.status === 'ready' && live.value === null) resumeWorkout();
  }, [live]);

  // Screens and bars that sit above the tab bar read this (tokens.css).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset['tabs'] = isWorkoutScreen ? 'hidden' : 'shown';
    root.dataset['resume'] = workout !== undefined && !isWorkoutScreen ? 'shown' : 'hidden';
  }, [isWorkoutScreen, workout]);

  if (isWorkoutScreen) return null;
  return (
    <>
      {workout !== undefined && <ResumeWorkoutBar name={workout.name} startedAt={workout.startedAt} />}
      <TabBar />
    </>
  );
}
