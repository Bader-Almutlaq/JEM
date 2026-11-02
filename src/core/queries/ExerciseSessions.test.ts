import { beforeAll, describe, expect, test } from 'vitest';
import { personalCurve, type PersonalCurveSet } from '../analytics/PersonalCurve';
import { Database } from '../db/Database';
import { migrate } from '../db/migrations';
import type { ExerciseRow } from '../models/Exercise';
import { ExerciseCurve } from './ExerciseCurve';
import { ExerciseSeries } from './ExerciseSeries';
import { ExerciseSessions } from './ExerciseSessions';
import { ExerciseStrength } from './ExerciseStrength';
import { seedSyntheticHistory, type SyntheticHistory } from './fixtures/SyntheticHistory';

const END = new Date('2026-10-30T12:00:00.000Z');
let db: Database;
let history: SyntheticHistory;

beforeAll(async () => {
  db = await Database.openInMemory();
  migrate(db, END);
  history = seedSyntheticHistory(db, { seed: 7, weeks: 30, exerciseCount: 12, end: END });
});

function exerciseRow(id: number): ExerciseRow {
  const row = db.get<ExerciseRow>('SELECT * FROM exercise WHERE id = ?', [id]);
  if (row === undefined) throw new Error(`Missing exercise ${id}`);
  return row;
}

describe('the shared exercise history read', () => {
  test('selects the same workouts as a per-workout existence check', () => {
    for (const id of history.exerciseIds) {
      const expected = db
        .all<{ id: number }>(
          `SELECT w.id FROM workout w WHERE w.isInProgress = 0 AND w.startedAt <= ?
           AND EXISTS (SELECT 1 FROM workoutExercise we WHERE we.workoutId = w.id AND we.exerciseId = ?)
           ORDER BY w.startedAt, w.id`,
          [END.toISOString(), id],
        )
        .map((row) => row.id);
      expect(ExerciseSessions.all(db, id, END).map((session) => session.workoutId)).toEqual(expected);
    }
  });

  test('fits the personal curve from the same sets as a direct query', () => {
    for (const id of history.exerciseIds) {
      const row = exerciseRow(id);
      const sets = db.all<PersonalCurveSet>(
        `SELECT s.kind, s.weightKilograms, s.reps, s.rpe, w.startedAt AS date
         FROM workoutSet s JOIN workoutExercise we ON we.id = s.workoutExerciseId JOIN workout w ON w.id = we.workoutId
         WHERE we.exerciseId = ? AND w.isInProgress = 0 AND s.isCompleted = 1 AND w.startedAt <= ?
         ORDER BY w.startedAt, w.id, we.position, s.position, s.id`,
        [id, END.toISOString()],
      );
      expect(ExerciseCurve(db, id, row, END)).toEqual(personalCurve(row, sets));
    }
  });

  test('a page is the newest slice of the full history', () => {
    const id = history.mostTrainedExerciseId;
    const all = ExerciseSessions.all(db, id, END);
    expect(ExerciseSessions.page(db, id, END, 5, 2)).toEqual([...all].reverse().slice(2, 7));
  });

  test('cached reads equal fresh reads, and a write shows up', () => {
    const id = history.mostTrainedExerciseId;
    const read = () => ({
      series: ExerciseSeries.read(db, id, END),
      strength: ExerciseStrength.series(db, id, END),
      curve: ExerciseCurve(db, id, exerciseRow(id), END),
    });
    const first = read();
    const second = read();
    expect(second.series).toBe(first.series);
    expect(second.strength).toBe(first.strength);
    db.cache.clear();
    expect(read()).toEqual(first);

    db.run(
      `UPDATE workoutSet SET weightKilograms = weightKilograms * 2, rpe = 10 WHERE id = (
         SELECT s.id FROM workoutSet s JOIN workoutExercise we ON we.id = s.workoutExerciseId
         JOIN workout w ON w.id = we.workoutId
         WHERE we.exerciseId = ? AND s.kind = 'working' ORDER BY w.startedAt DESC LIMIT 1)`,
      [id],
    );
    const updated = read();
    expect(updated.strength).not.toEqual(first.strength);
    db.cache.clear();
    expect(read()).toEqual(updated);
  });

  test('a time before the newest workout reads a shorter history', () => {
    const id = history.mostTrainedExerciseId;
    const all = ExerciseSessions.all(db, id, END);
    const middle = all[Math.floor(all.length / 2)];
    if (middle === undefined) throw new Error('Expected history');
    const earlier = ExerciseSessions.all(db, id, new Date(middle.date));
    expect(earlier.at(-1)?.workoutId).toBe(middle.workoutId);
    expect(earlier.length).toBeLessThan(all.length);
  });
});
