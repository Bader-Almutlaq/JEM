import { afterEach, beforeEach, expect, test } from 'vitest';
import { Database } from '../db/Database';
import { migrate } from '../db/migrations';
import { progressionHistory } from './progressionHistory';

let db: Database;
beforeEach(async () => {
  db = await Database.openInMemory();
  migrate(db);
  db.exec(`
    INSERT INTO exercise (id, name, source, createdAt) VALUES (1, 'Synthetic press', 'custom', '2026-01-01');
    INSERT INTO template (id, name, position, createdAt, updatedAt) VALUES (1, 'Synthetic workout', 0, 'a', 'a');
  `);
});
afterEach(() => db.close());

function session(
  date: string,
  options: {
    readonly templateId?: number | null;
    readonly deload?: boolean;
    readonly completed?: boolean;
    readonly kind?: string;
    readonly inProgress?: boolean;
  } = {},
): number {
  const id = db.run(
    `
    INSERT INTO workout (startedAt, name, source, templateId, isInProgress)
    VALUES (?, 'Synthetic session', 'app', ?, ?)
  `,
    [date, options.templateId === undefined ? 1 : options.templateId, options.inProgress ? 1 : 0],
  ).lastInsertRowId;
  for (const [position, brand] of ['Panatta', 'Nautilus'].entries()) {
    const entry = db.run(
      `
      INSERT INTO workoutExercise (workoutId, exerciseId, position, machineBrand, deloadStage)
      VALUES (?, 1, ?, ?, ?)
    `,
      [id, position, brand, options.deload ? 1 : null],
    ).lastInsertRowId;
    db.run(
      `
      INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, isCompleted)
      VALUES (?, 0, ?, ?, 'kg', 10, ?)
    `,
      [entry, options.kind ?? 'working', 100 + position * 20, options.completed === false ? 0 : 1],
    );
  }
  return id;
}

test('only three normal finished sessions in this workout count; deloads, unfinished work and warm-up-only sessions do not', () => {
  session('2026-10-01');
  session('2026-10-02');
  session('2026-10-03');
  session('2026-10-04');
  session('2026-10-05', { deload: true });
  session('2026-10-06', { templateId: null });
  session('2026-10-07', { completed: false });
  session('2026-10-08', { kind: 'warmup' });
  session('2026-10-09', { inProgress: true });
  const result = progressionHistory(db, 1, 1, 0);
  expect(result.map((sets) => sets[0]?.workoutExerciseId)).toEqual([7, 5, 3]);
  expect(progressionHistory(db, 1, null, 0)).toEqual([]);
});

test('repeated occurrences and recorded manufacturers stay isolated, with no fallback', () => {
  session('2026-10-01');
  expect(progressionHistory(db, 1, 1, 0, null, 'panatta')[0]?.[0]?.weightKilograms).toBe(100);
  expect(progressionHistory(db, 1, 1, 1, null, 'Nautilus')[0]?.[0]?.weightKilograms).toBe(120);
  expect(progressionHistory(db, 1, 1, 0, null, 'Nautilus')).toEqual([]);
  expect(progressionHistory(db, 1, 1, 2)).toEqual([]);
});

test('same-date sessions sort by id; excluded session cannot feed itself; drop and failure count', () => {
  const first = session('2026-10-01', { kind: 'drop' });
  const second = session('2026-10-01', { kind: 'failure' });
  expect(progressionHistory(db, 1, 1, 0).map((sets) => sets[0]?.kind)).toEqual(['failure', 'drop']);
  expect(progressionHistory(db, 1, 1, 0, second).map((sets) => sets[0]?.kind)).toEqual(['drop']);
  expect(progressionHistory(db, 1, 1, 0, first).map((sets) => sets[0]?.kind)).toEqual(['failure']);
});
