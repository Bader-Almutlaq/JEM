import { describe, expect, test } from 'vitest';
import { Database } from '../db/Database';
import { migrate } from '../db/migrations';
import { seedHistoryFixture } from './fixtures/historyFixture';
import { workoutDetail } from './WorkoutHistory';
import { workoutExerciseBests } from './WorkoutExerciseBests';

async function fixtureDatabase() {
  const db = await Database.openInMemory();
  migrate(db);
  return { db, ...seedHistoryFixture(db) };
}

describe('workoutExerciseBests', () => {
  test('matches an independent reading of every workout: set counts without warm-ups, heaviest set then most reps', async () => {
    const { db, pushWorkoutId, legsWorkoutId } = await fixtureDatabase();
    try {
      const bests = workoutExerciseBests(db);
      for (const id of [pushWorkoutId, legsWorkoutId]) {
        if (id === undefined) throw new Error('Missing fixture');
        const expected = (workoutDetail(db, id)?.entries ?? []).flatMap((item) => {
          const work = item.sets.filter((set) => set.kind !== 'warmup');
          const best = work.toSorted((a, b) => b.weightKilograms - a.weightKilograms || b.reps - a.reps)[0];
          return best === undefined
            ? []
            : [{ name: item.exercise.name, setCount: work.length, weight: best.weightKilograms, reps: best.reps }];
        });
        expect(
          (bests.get(id) ?? []).map((entry) => ({
            name: entry.name,
            setCount: entry.setCount,
            weight: entry.best.weightKilograms,
            reps: entry.best.reps,
          })),
        ).toEqual(expected);
      }
    } finally {
      db.close();
    }
  });

  test('restricts to the workouts asked for and leaves out an exercise with only warm-ups', async () => {
    const { db, pushWorkoutId, legsWorkoutId } = await fixtureDatabase();
    try {
      if (pushWorkoutId === undefined || legsWorkoutId === undefined) throw new Error('Missing fixture');
      db.run(
        "UPDATE workoutSet SET kind = 'warmup' WHERE workoutExerciseId IN (SELECT id FROM workoutExercise WHERE workoutId = ?)",
        [legsWorkoutId],
      );
      const only = workoutExerciseBests(db, [pushWorkoutId, legsWorkoutId]);
      expect([...only.keys()]).toEqual([pushWorkoutId]);
      expect([...workoutExerciseBests(db, [legsWorkoutId]).keys()]).toEqual([]);
    } finally {
      db.close();
    }
  });

  test('an in-progress workout has no history card', async () => {
    const { db, pushWorkoutId } = await fixtureDatabase();
    try {
      if (pushWorkoutId === undefined) throw new Error('Missing fixture');
      db.run('UPDATE workout SET isInProgress = 1 WHERE id = ?', [pushWorkoutId]);
      expect(workoutExerciseBests(db).has(pushWorkoutId)).toBe(false);
    } finally {
      db.close();
    }
  });
});
