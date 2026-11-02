import { afterEach, beforeEach, expect, test } from 'vitest';
import { Database } from '../db/Database';
import { migrate } from '../db/migrations';
import { liveWorkoutSnapshot } from '../queries/LiveWorkout';
import { workoutDetail } from '../queries/WorkoutHistory';
import { WorkoutLogger } from './WorkoutLogger';

let db: Database;
let logger: WorkoutLogger;
const day = (date: number) => new Date(`2026-01-${String(date).padStart(2, '0')}T12:00:00Z`);

beforeEach(async () => {
  db = await Database.openInMemory();
  migrate(db);
  db.exec(`
    INSERT INTO exercise (id, name, equipment, movementPattern, mechanic, source, createdAt)
    VALUES (1, 'Synthetic squat', 'barbell', 'squat', 'compound', 'custom', '2026-01-01'),
      (2, 'Synthetic curl', 'dumbbell', 'curl', 'isolation', 'custom', '2026-01-01');
    INSERT INTO workout (id, name, startedAt, source) VALUES (1, 'Normal', '2026-01-01T12:00:00.000Z', 'app');
    INSERT INTO workoutExercise (id, workoutId, exerciseId, position) VALUES (1, 1, 1, 0), (2, 1, 2, 1);
    INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps)
    VALUES (1, 0, 'working', 100, 'kg', 8), (2, 0, 'working', 30, 'kg', 12);
  `);
  logger = new WorkoutLogger(db);
});
afterEach(() => db.close());

function entry(workoutId: number, position = 0) {
  const result = liveWorkoutSnapshot(db, workoutId)?.entries[position];
  if (result === undefined) throw new Error('Missing synthetic entry');
  return result;
}
function start(date: number, exerciseId = 1) {
  const id = logger.start('Synthetic session', day(date));
  logger.addExercise(exerciseId, id);
  return id;
}
function finish(id: number, date: number, weight?: number) {
  const set = entry(id).sets[0];
  if (set === undefined) throw new Error('Missing synthetic set');
  if (weight !== undefined) logger.updateSet(set.id, weight, 'kg', set.reps, set.rpe, set.kind, set.durationSeconds);
  logger.setCompleted(set.id, true, day(date));
  logger.finish(id, day(date));
}

test('set and clear change only stage; reads, ticking and finish never accept suggestions', () => {
  const id = start(2);
  const before = entry(id);
  logger.setDeloadStage(before.entry.id, 1);
  expect(entry(id).entry.deloadStage).toBe(1);
  expect(entry(id).deload?.suggestions[0]?.weightKilograms).toBe(80);
  expect(entry(id).sets).toEqual(before.sets);
  logger.setDeloadStage(before.entry.id, null);
  expect(entry(id).entry.deloadStage).toBeNull();
  expect(entry(id).deload).toBeUndefined();
  logger.setDeloadStage(before.entry.id, 1);
  finish(id, 2);
  expect(workoutDetail(db, id)?.entries[0]).toMatchObject({
    entry: { deloadStage: 1 },
    sets: [{ weightKilograms: 100 }],
  });
});

test('stage 1 → stage 2 → normal follows performed sessions; stage 2 builds from 100 to 90 rather than 80 to 72', () => {
  const first = start(2);
  logger.setDeloadStage(entry(first).entry.id, 1);
  finish(first, 2, 80);
  const second = start(3);
  expect(entry(second).entry.deloadStage).toBe(2);
  expect(entry(second).deload?.suggestions[0]).toMatchObject({ weightKilograms: 90, reps: 8 });
  finish(second, 3, 90);
  const third = start(4);
  expect(entry(third).entry.deloadStage).toBeNull();
  expect(entry(third).deload).toBeUndefined();
});

test('ending automatic stage 2 stops propagation and does not alter the previous stored stage', () => {
  const first = start(2);
  logger.setDeloadStage(entry(first).entry.id, 1);
  finish(first, 2, 80);
  const second = start(3);
  logger.setDeloadStage(entry(second).entry.id, null);
  finish(second, 3);
  expect(workoutDetail(db, first)?.entries[0]?.entry.deloadStage).toBe(1);
  expect(entry(start(4)).entry.deloadStage).toBeNull();
});

test('whole workout sets every current entry, leaves sets unchanged and stages remain independent', () => {
  const id = start(2);
  logger.addExercise(2, id);
  const before = db.all('SELECT * FROM workoutSet');
  logger.deloadWorkout(id);
  expect(liveWorkoutSnapshot(db, id)?.entries.map((item) => item.entry.deloadStage)).toEqual([1, 1]);
  expect(db.all('SELECT * FROM workoutSet')).toEqual(before);
  logger.setDeloadStage(entry(id, 1).entry.id, null);
  expect(liveWorkoutSnapshot(db, id)?.entries.map((item) => item.entry.deloadStage)).toEqual([1, null]);
  logger.discard(id);
  expect(entry(start(3, 2)).entry.deloadStage).toBeNull();
});

test('stage survives finish, all historical edits and a database backup round trip', async () => {
  const id = start(2);
  const current = entry(id);
  logger.setDeloadStage(current.entry.id, 1);
  finish(id, 2, 80);
  logger.updateFinished(id, { field: 'name', value: 'Edited' });
  logger.updateExerciseNotes(current.entry.id, 'Edited note');
  logger.setEntryUnit('lb', current.entry.id);
  const added = logger.addSet(current.entry.id);
  logger.deleteSet(added);
  const restored = await Database.fromBytes(db.exportBytes());
  try {
    expect(workoutDetail(restored, id)?.entries[0]?.entry).toMatchObject({ deloadStage: 1, notes: 'Edited note' });
  } finally {
    restored.close();
  }
});

test('historical additions do not inherit a stage from a later performed session', () => {
  const id = start(3);
  logger.setDeloadStage(entry(id).entry.id, 1);
  finish(id, 3);
  const added = logger.addExercise(1, 1);
  expect(db.value('SELECT deloadStage FROM workoutExercise WHERE id = ?', [added])).toBeNull();
});

test('discarding a stage 2 does not consume it; another exercise has its own stage', () => {
  const first = start(2);
  logger.setDeloadStage(entry(first).entry.id, 1);
  finish(first, 2, 80);
  const second = start(3);
  logger.addExercise(2, second);
  expect(entry(second).entry.deloadStage).toBe(2);
  expect(entry(second, 1).entry.deloadStage).toBeNull();
  logger.discard(second);
  expect(entry(start(4)).entry.deloadStage).toBe(2);
});

test('template start automatically advances deload and overrides opt-in progression', () => {
  db.exec(`
    INSERT INTO template (id, name, position, createdAt, updatedAt) VALUES (1, 'Synthetic', 0, 'a', 'a');
    INSERT INTO templateExercise (id, templateId, exerciseId, position, progression) VALUES (1, 1, 1, 0, 'double');
    INSERT INTO templateSet (templateExerciseId, position, kind, targetRepsLow, targetRepsHigh) VALUES (1, 0, 'working', 6, 8);
  `);
  db.run('UPDATE workout SET templateId = 1 WHERE id = 1');
  const first = logger.startFromTemplate(1, day(2));
  expect(entry(first).progression?.suggestions[0]?.weightKilograms).toBe(102.5);
  logger.setDeloadStage(entry(first).entry.id, 1);
  expect(entry(first).progression).toBeUndefined();
  expect(entry(first).deload?.suggestions[0]?.weightKilograms).toBe(80);
  finish(first, 2, 80);
  const second = logger.startFromTemplate(1, day(3));
  expect(entry(second).entry.deloadStage).toBe(2);
  expect(entry(second).deload?.suggestions[0]?.weightKilograms).toBe(90);
  logger.setDeloadStage(entry(second).entry.id, null);
  expect(entry(second).progression).toBeDefined();
});

test('repeated occurrences advance independently and use their own original load', () => {
  const secondNormal = logger.addExercise(1, 1);
  const set = workoutDetail(db, 1)?.entries.find((item) => item.entry.id === secondNormal)?.sets[0];
  if (set === undefined) throw new Error('Missing repeat');
  logger.updateSet(set.id, 50, 'kg', 10, null, 'working', null);
  const id = start(2);
  logger.addExercise(1, id);
  logger.setDeloadStage(entry(id, 1).entry.id, 1);
  expect(entry(id, 1).deload?.suggestions[0]).toMatchObject({ weightKilograms: 40, reps: 10 });
  for (const item of liveWorkoutSnapshot(db, id)?.entries ?? []) {
    for (const row of item.sets) logger.setCompleted(row.id, true, day(2));
  }
  logger.finish(id, day(2));
  const next = start(3);
  logger.addExercise(1, next);
  expect(entry(next).entry.deloadStage).toBeNull();
  expect(entry(next, 1).entry.deloadStage).toBe(2);
});

test('missing workout or exercise fails without changing anything', () => {
  const before = db.exportBytes();
  expect(() => logger.setDeloadStage(-1, 1)).toThrow('That exercise no longer exists.');
  expect(() => logger.deloadWorkout(-1)).toThrow('That workout no longer exists.');
  expect(db.exportBytes()).toEqual(before);
});

test('deload prefers the selected machine baseline over a newer heavier machine', () => {
  db.exec(`
    UPDATE exercise SET equipment = 'machine' WHERE id = 1;
    UPDATE workoutExercise SET machineBrand = 'Panatta' WHERE id = 1;
  `);
  const newer = start(2);
  logger.setMachineBrand(entry(newer).entry.id, 'Hammer Strength');
  finish(newer, 2, 150);
  const current = start(3);
  logger.setMachineBrand(entry(current).entry.id, 'Panatta');
  logger.setDeloadStage(entry(current).entry.id, 1);
  expect(entry(current).previous[0]?.weightKilograms).toBe(100);
  expect(entry(current).deload?.suggestions[0]?.weightKilograms).toBe(90);
});

test('set reduction keeps warmups and completed sets and removes trailing uncompleted work', () => {
  const id = start(2);
  const entryId = entry(id).entry.id;
  logger.addSet(entryId, 'warmup');
  logger.addSet(entryId);
  logger.addSet(entryId);
  logger.addSet(entryId);
  const before = entry(id).sets;
  const work = before.filter((set) => set.kind !== 'warmup');
  const completed = work[0];
  if (completed === undefined) throw new Error('Missing working set');
  logger.setCompleted(completed.id, true, day(2));
  logger.setDeloadStage(entryId, 1, { mode: 'both', loadPercent: 15, setPercent: 50 });
  const after = entry(id);
  expect(after.sets.filter((set) => set.kind === 'warmup')).toHaveLength(1);
  expect(after.sets.filter((set) => set.kind !== 'warmup').map((set) => set.id)).toEqual(
    work.slice(0, 2).map((set) => set.id),
  );
  expect(after.entry).toMatchObject({ deloadMode: 'both', deloadLoadPercent: 15, deloadSetPercent: 50 });
});

test('set reduction leaves every set when completed work exceeds the target', () => {
  const id = start(2);
  const entryId = entry(id).entry.id;
  logger.addSet(entryId);
  logger.addSet(entryId);
  for (const set of entry(id).sets) logger.setCompleted(set.id, true, day(2));
  const before = entry(id).sets;
  logger.setDeloadStage(entryId, 1, { mode: 'sets', loadPercent: null, setPercent: 50 });
  expect(entry(id).sets).toEqual(before);
});

test('saving the same absolute target twice does not remove more sets', () => {
  const id = start(2);
  const entryId = entry(id).entry.id;
  for (let index = 0; index < 3; index += 1) logger.addSet(entryId);
  const settings = { mode: 'sets' as const, loadPercent: null, setPercent: 50 };
  logger.setDeloadStage(entryId, 1, settings, 2);
  const after = entry(id).sets;
  logger.setDeloadStage(entryId, 1, settings, 2);
  expect(entry(id).sets).toEqual(after);
});

test('both restores the pre-cycle count for a new exercise and a template without duplicating sets', () => {
  db.exec(`
    INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps)
    VALUES (1, 1, 'working', 100, 'kg', 8), (1, 2, 'working', 100, 'kg', 8), (1, 3, 'working', 100, 'kg', 8);
    INSERT INTO template (id, name, position, createdAt, updatedAt) VALUES (1, 'Synthetic', 0, 'a', 'a');
    INSERT INTO templateExercise (id, templateId, exerciseId, position) VALUES (1, 1, 1, 0);
    INSERT INTO templateSet (templateExerciseId, position, kind) VALUES (1, 0, 'working'), (1, 1, 'working'), (1, 2, 'working'), (1, 3, 'working');
  `);
  const first = start(2);
  logger.setDeloadStage(entry(first).entry.id, 1, { mode: 'both', loadPercent: 20, setPercent: 50 }, 2);
  for (const set of entry(first).sets) logger.setCompleted(set.id, true, day(2));
  logger.finish(first, day(2));
  const next = start(3);
  expect(entry(next).sets.filter((set) => set.kind !== 'warmup')).toHaveLength(4);
  expect(entry(next).entry).toMatchObject({ deloadStage: 2, deloadMode: 'load' });
  logger.discard(next);
  const template = logger.startFromTemplate(1, day(3));
  expect(entry(template).sets.filter((set) => set.kind !== 'warmup')).toHaveLength(4);
});

test('keeping every set stores a zero reduction without changing its count', () => {
  const id = start(2);
  const entryId = entry(id).entry.id;
  logger.setDeloadStage(entryId, 1, { mode: 'sets', loadPercent: null, setPercent: 0 }, 1);
  expect(entry(id).entry.deloadSetPercent).toBe(0);
  expect(entry(id).sets).toHaveLength(1);
});

test('a sets-only deload is followed by a normal session with the pre-cycle set count', () => {
  db.exec(`
    INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps)
    VALUES (1, 1, 'working', 100, 'kg', 8), (1, 2, 'working', 100, 'kg', 8), (1, 3, 'working', 100, 'kg', 8);
  `);
  const first = start(2);
  logger.setDeloadStage(entry(first).entry.id, 1, { mode: 'sets', loadPercent: null, setPercent: 50 }, 2);
  for (const set of entry(first).sets) logger.setCompleted(set.id, true, day(2));
  logger.finish(first, day(2));
  const next = start(3);
  expect(entry(next).entry).toMatchObject({ deloadStage: null, deloadMode: null });
  const work = entry(next).sets.filter((set) => set.kind !== 'warmup');
  expect(work).toHaveLength(4);
  expect(work.every((set) => set.rpe === null && !set.isCompleted)).toBe(true);
});
