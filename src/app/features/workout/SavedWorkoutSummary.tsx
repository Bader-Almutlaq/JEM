import { Section } from '../../design/components/Section';
import { warmupCountText } from '../../format/setText';
import { PersonalBestsSection } from './PersonalBestsSection';
import { WorkoutComparisonSection } from './WorkoutComparisonSection';
import type { ReactNode } from 'react';
import { database, useDatabaseQuery } from '../../data/database';
import { EmptyState } from '../../design/components/EmptyState';
import { Screen } from '../../design/components/Screen';
import { durationText } from '../../format/dateText';
import { volumeText } from '../../format/weightText';
import { SaveAsTemplate } from '../templates/SaveAsTemplate';
import { BackupReminderLine } from './BackupReminderLine';
import { ExerciseBestsTable } from '../history/ExerciseBestsTable';
import { SummaryStat } from './SummaryStat';
import styles from './SavedWorkoutSummary.module.css';

/** The totals and exercises of a workout that was just finished. `done` is the button that leaves the screen. */
export function SavedWorkoutSummary({ workoutId, done }: { readonly workoutId: number; readonly done: ReactNode }) {
  const summary = useDatabaseQuery(`workout-summary-${workoutId}`, async () => ({
    totals: await database.finishedWorkoutSummary(workoutId),
    detail: await database.workoutDetail(workoutId),
    bests: await database.personalBestsForWorkout(workoutId),
    comparison: await database.workoutComparison(workoutId),
    exercises: (await database.historyExerciseBests([workoutId])).get(workoutId) ?? [],
  }));

  if (summary.status !== 'ready' || summary.value.totals === null || summary.value.detail === undefined) {
    const message = summary.status === 'failed' ? summary.message : 'Loading…';
    return (
      <Screen title="Workout">
        <EmptyState message={message} />
        {summary.status === 'loading' ? null : done}
      </Screen>
    );
  }

  const { totals, detail } = summary.value;
  const warmups = totals.warmupCount ?? 0;
  return (
    <Screen title={totals.name}>
      <div className={styles.stats}>
        <SummaryStat label="Duration" value={durationText(totals.startedAt, totals.endedAt) ?? '—'} />
        <SummaryStat
          label="Sets"
          value={String(totals.setCount)}
          {...(warmups > 0 ? { detail: `+ ${warmupCountText(warmups)}` } : {})}
        />
        <SummaryStat label="Volume" value={volumeText(totals.volumeKilograms)} />
      </div>
      <PersonalBestsSection bests={summary.value.bests} />
      <Section label="Exercises">
        <div className={styles.table}>
          <ExerciseBestsTable label="Exercises in this workout" exercises={summary.value.exercises} />
        </div>
      </Section>
      <WorkoutComparisonSection comparison={summary.value.comparison} />
      <BackupReminderLine />
      <SaveAsTemplate workoutId={workoutId} workoutName={totals.name} templateId={detail.workout.templateId} />
      {done}
    </Screen>
  );
}
