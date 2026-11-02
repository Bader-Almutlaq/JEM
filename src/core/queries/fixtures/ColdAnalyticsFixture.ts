import type { Database } from '../../db/Database';
import { TemplateSessionsFixture } from './TemplateSessionsFixture';

/** Synthetic mixed history for cold-query equivalence, including custom and untagged exercises. */
export const ColdAnalyticsFixture = Object.freeze({
  /** Seeds an empty migrated database; inserts dates out of order and keeps repeated same-day sessions. */
  seed(db: Database): void {
    TemplateSessionsFixture.seed(db);
    db.exec(`
      INSERT INTO exerciseMuscle (exerciseId, muscleId, role) VALUES
        (1, 'chest', 'primary'), (1, 'triceps', 'secondary'),
        (2, 'upper-back', 'primary'), (2, 'biceps', 'secondary');
      INSERT INTO exercise (id, name, source, createdAt, tracking, mechanic) VALUES
        (3, 'Untagged custom', 'custom', '2024-01-01', 'weight-reps', 'isolation'),
        (4, 'Timed custom', 'custom', '2024-01-01', 'duration', 'isolation'),
        (5, 'Other press', 'custom', '2024-01-01', 'weight-reps', 'isolation');
      INSERT INTO exerciseMuscle (exerciseId, muscleId, role) VALUES
        (4, 'chest', 'primary'), (5, 'chest', 'primary'), (5, 'triceps', 'secondary');
      UPDATE workoutExercise SET deloadStage = 1 WHERE id = 7;
      UPDATE workoutExercise SET machineBrand = 'Synthetic' WHERE id IN (1, 2);
      INSERT INTO workout (id, name, source, startedAt, isInProgress, templateId) VALUES
        (10, 'Older inserted later', 'strong', '2023-12-31T12:00:00.000Z', 0, 1),
        (11, 'Empty', 'app', '2024-01-22T12:00:00.000Z', 0, 1);
      INSERT INTO workoutExercise (id, workoutId, exerciseId, position) VALUES
        (10, 10, 1, 0), (11, 10, 5, 1), (12, 1, 3, 3), (13, 1, 4, 4);
      INSERT INTO workoutSet
        (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, rpe, isCompleted)
      VALUES (10, 0, 'working', 40, 'kg', 8, 7.5, 1),
             (11, 0, 'failure', 40, 'kg', 8, 2, 1),
             (12, 0, 'working', 40, 'kg', 8, NULL, 1),
             (13, 0, 'working', 0, 'kg', 0, 8, 1);
    `);
    for (let index = 0; index < 30; index += 1) {
      const date = new Date(2024, 1, 1 + index * 3, 12);
      const workoutId = db.run(
        `
          INSERT INTO workout (name, source, startedAt, isInProgress, templateId)
          VALUES ('Synthetic sequence', 'app', ?, 0, ?)
        `,
        [date.toISOString(), index % 2 === 0 ? 1 : 3],
      ).lastInsertRowId;
      for (const exerciseId of [1, 2, 3, 5]) {
        const entryId = db.run(
          `
            INSERT INTO workoutExercise (workoutId, exerciseId, position, deloadStage)
            VALUES (?, ?, ?, ?)
          `,
          [workoutId, exerciseId, exerciseId, index % 8 === 0 ? 2 : null],
        ).lastInsertRowId;
        for (const [position, kind, rpe, completed] of [
          [0, 'warmup', 10, 1],
          [1, 'working', 8.5, 1],
          [2, 'drop', null, 1],
          [3, 'failure', 2, 1],
          [4, 'working', 5, 1],
          [5, 'working', 9, 0],
        ] as const) {
          db.run(
            `
              INSERT INTO workoutSet
                (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, rpe, isCompleted)
              VALUES (?, ?, ?, ?, 'kg', ?, ?, ?)
            `,
            [entryId, position, kind, 40 + index, 1 + (index % 35), rpe, completed],
          );
        }
      }
    }
  },
});
