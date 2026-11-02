import { afterEach, beforeEach, expect, test } from 'vitest';
import type { TemplateSetDraft } from '../templates/TemplateDraft';
import { Database } from '../db/Database';
import { migrate } from '../db/migrations';
import { toKilograms } from '../units/Weight';
import { WorkoutLogger } from '../logging/WorkoutLogger';
import { TemplateCatalog } from './TemplateCatalog';
import { TemplateStore } from '../templates/TemplateStore';
import { liveWorkoutSnapshot } from './LiveWorkout';
import { previousPerformance } from './PreviousPerformance';

const now = new Date('2026-10-31T12:00:00Z');
const targets: readonly TemplateSetDraft[] = [8, 8, 8].map((low) => ({
  kind: 'working',
  targetRepsLow: low,
  targetRepsHigh: 12,
  targetRpe: 8,
}));
let db: Database;
let templateId: number;
let logger: WorkoutLogger;

beforeEach(async () => {
  db = await Database.openInMemory();
  migrate(db);
  db.exec(`
    INSERT INTO exercise (id, name, equipment, source, createdAt)
    VALUES (1, 'Synthetic press', 'barbell', 'custom', '2026-01-01');
  `);
  templateId = TemplateStore.save(
    db,
    {
      name: 'Push',
      folderId: null,
      notes: null,
      exercises: [{ exerciseId: 1, progression: 'double', supersetGroup: null, notes: null, sets: targets }],
    },
    now,
  );
  logger = new WorkoutLogger(db);
});
afterEach(() => db.close());

function history(date: string, template: number | null, reps = 12): number {
  const workout = db.run(
    `
    INSERT INTO workout (startedAt, endedAt, name, source, templateId)
    VALUES (?, ?, 'Synthetic history', 'app', ?)
  `,
    [date, date, template],
  ).lastInsertRowId;
  const entry = db.run(
    `
    INSERT INTO workoutExercise (workoutId, exerciseId, position) VALUES (?, 1, 0)
  `,
    [workout],
  ).lastInsertRowId;
  for (let position = 0; position < targets.length; position += 1) {
    db.run(
      `
      INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, rpe)
      VALUES (?, ?, 'working', 100, 'kg', ?, 8)
    `,
      [entry, position, reps],
    );
  }
  return workout;
}
function firstEntry(workoutId: number) {
  const entry = liveWorkoutSnapshot(db, workoutId)?.entries[0];
  if (entry === undefined) throw new Error('Missing synthetic entry');
  return entry;
}

test('same-template history beats newer sessions elsewhere and feeds both grey and amber values', () => {
  history('2026-10-01', templateId, 10);
  history('2026-10-20', null, 12);
  const id = logger.startFromTemplate(templateId, now);
  const entry = firstEntry(id);
  expect(entry.previous.map((set) => set.reps)).toEqual([10, 10, 10]);
  expect(entry.sets.map((set) => [set.weightKilograms, set.reps])).toEqual([
    [100, 10],
    [100, 10],
    [100, 10],
  ]);
  expect(entry.progression?.suggestions.map((set) => [set.weightKilograms, set.reps])).toEqual([
    [100, 11],
    [100, 11],
    [100, 11],
  ]);
  expect(previousPerformance(db, 1, id).map((set) => set.reps)).toEqual([12, 12, 12]);
});

test('other-workout history stays grey but cannot establish progression', () => {
  history('2026-10-20', null, 12);
  const id = logger.startFromTemplate(templateId, now);
  expect(firstEntry(id).progression?.suggestions).toEqual([]);
  expect(firstEntry(id).previous[0]?.weightKilograms).toBe(100);
});

test('no history has no suggestions, and no progression is computed for an ad hoc workout', () => {
  const id = logger.startFromTemplate(templateId, now);
  expect(firstEntry(id).progression?.suggestions).toEqual([]);
  db.run('UPDATE workout SET templateId = NULL WHERE id = ?', [id]);
  expect(firstEntry(id).progression).toBeUndefined();
});

test('turning progression off restores global last-time behavior', () => {
  history('2026-10-01', templateId, 10);
  history('2026-10-20', null, 12);
  db.run("UPDATE templateExercise SET progression = NULL, progressionMode = 'off'");
  const entry = firstEntry(logger.startFromTemplate(templateId, now));
  expect(entry.progression).toBeUndefined();
  expect(entry.sets.map((set) => set.reps)).toEqual([12, 12, 12]);
});

test('warm-ups are ignored; suggestions survive reload and ticking without accepting keeps the baseline', async () => {
  const old = history('2026-10-01', templateId, 12);
  db.run(
    `
    INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, rpe)
    SELECT id, 3, 'warmup', 20, 'kg', 1, 10 FROM workoutExercise WHERE workoutId = ?
  `,
    [old],
  );
  const id = logger.startFromTemplate(templateId, now);
  const before = firstEntry(id);
  const stored = db.all('SELECT * FROM workoutSet');
  firstEntry(id);
  expect(db.all('SELECT * FROM workoutSet')).toEqual(stored);
  const reloaded = await Database.fromBytes(db.exportBytes());
  try {
    expect(liveWorkoutSnapshot(reloaded, id)?.entries[0]?.progression).toEqual(before.progression);
    const set = before.sets[0];
    if (set === undefined) throw new Error('Missing set');
    new WorkoutLogger(reloaded).setCompleted(set.id, true, now);
    const completed = liveWorkoutSnapshot(reloaded, id)?.entries[0]?.sets[0];
    expect(completed).toMatchObject({ weightKilograms: 100, reps: 12, isCompleted: true });
    expect(liveWorkoutSnapshot(reloaded, id)?.entries[0]?.progression?.suggestions).toHaveLength(2);
  } finally {
    reloaded.close();
  }
});

test('each workout of an exercise has its own mode and targets; copying retains them', () => {
  const copyId = TemplateStore.duplicate(db, templateId, now);
  expect(TemplateCatalog.detail(db, copyId)?.exercises[0]).toMatchObject({ progression: 'double', sets: targets });
  const original = TemplateCatalog.detail(db, templateId);
  if (original === undefined) throw new Error('Missing template');
  TemplateStore.save(
    db,
    { ...original, exercises: original.exercises.map((exercise) => ({ ...exercise, progression: null })) },
    now,
  );
  expect(TemplateCatalog.detail(db, templateId)?.exercises[0]?.progression).toBeNull();
  expect(TemplateCatalog.detail(db, copyId)?.exercises[0]?.progression).toBe('double');
});

test('mode changes save without inventing or requiring rep ranges', () => {
  const original = TemplateCatalog.detail(db, templateId);
  if (original === undefined) throw new Error('Missing template');
  TemplateStore.save(
    db,
    {
      ...original,
      exercises: original.exercises.map((exercise) => ({
        ...exercise,
        progressionMode: 'weight-first',
        sets: [{ kind: 'working', targetRepsLow: null, targetRepsHigh: null, targetRpe: null }],
      })),
    },
    now,
  );
  expect(TemplateCatalog.detail(db, templateId)?.exercises[0]).toMatchObject({
    progressionMode: 'weight-first',
    sets: [{ targetRepsLow: null, targetRepsHigh: null }],
  });
  expect(firstEntry(logger.startFromTemplate(templateId, now)).progression?.suggestions).toEqual([]);
});

test('repeated exercises match their own historical occurrence and per-set range', () => {
  const original = TemplateCatalog.detail(db, templateId);
  const first = original?.exercises[0];
  if (original === undefined || first === undefined) throw new Error('Missing template');
  const secondTargets = targets.map((set) => ({ ...set, targetRepsLow: 4, targetRepsHigh: 6 }));
  TemplateStore.save(db, { ...original, exercises: [first, { ...first, sets: secondTargets }] }, now);
  const old = history('2026-10-01', templateId, 12);
  const second = db.run(
    `
    INSERT INTO workoutExercise (workoutId, exerciseId, position) VALUES (?, 1, 1)
  `,
    [old],
  ).lastInsertRowId;
  for (let position = 0; position < secondTargets.length; position += 1) {
    db.run(
      `
      INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, rpe)
      VALUES (?, ?, 'working', 80, 'kg', 6, 8)
    `,
      [second, position],
    );
  }
  const id = logger.startFromTemplate(templateId, now);
  const entries = liveWorkoutSnapshot(db, id)?.entries;
  expect(entries?.[0]?.sets[0]).toMatchObject({ weightKilograms: 100, reps: 12 });
  expect(entries?.[1]?.sets[0]).toMatchObject({ weightKilograms: 80, reps: 6 });
  expect(entries?.[0]?.progression?.suggestions[0]).toMatchObject({ weightKilograms: 102.5, reps: 8 });
  expect(entries?.[1]?.progression?.suggestions[0]).toMatchObject({ weightKilograms: 82.5, reps: 4 });
});

test('switching units after completing a set uses the pending set units for its load ladder', () => {
  history('2026-10-01', templateId, 12);
  const id = logger.startFromTemplate(templateId, now);
  const before = firstEntry(id);
  const first = before.sets[0];
  if (first === undefined) throw new Error('Missing first set');
  logger.setCompleted(first.id, true, now);
  logger.setEntryUnit('lb', before.entry.id);
  const after = firstEntry(id);
  expect(after.sets[0]?.entryUnit).toBe('kg');
  expect(after.sets[1]?.entryUnit).toBe('lb');
  expect(after.progression?.suggestions[0]?.weightKilograms).toBeCloseTo(toKilograms(225, 'lb'), 12);
  expect(after.progression?.suggestions[0]?.reps).toBe(8);
});

test('template targets remain available when progression is disabled and during deload', () => {
  db.run(`UPDATE templateExercise SET progression = NULL, progressionMode = 'off' WHERE templateId = ?`, [templateId]);
  const id = logger.startFromTemplate(templateId, now);
  const entry = firstEntry(id);
  expect(entry.progression).toBeUndefined();
  expect(entry.plannedTargets).toEqual(targets.map((set) => ({ ...set, targetRpeHigh: null })));
  db.run(`UPDATE workoutExercise SET deloadStage = 1 WHERE id = ?`, [entry.entry.id]);
  expect(firstEntry(id).plannedTargets).toEqual(targets.map((set) => ({ ...set, targetRpeHigh: null })));
});

test('automatic default starts without enabling; existing double rows retain reps first', () => {
  db.run("UPDATE exercise SET mechanic = 'compound'");
  db.run('UPDATE templateExercise SET progression = NULL');
  const prior = history('2026-10-01', templateId, 8);
  db.run(
    'UPDATE workoutSet SET weightKilograms = 140 WHERE workoutExerciseId IN (SELECT id FROM workoutExercise WHERE workoutId = ?)',
    [prior],
  );
  const id = logger.startFromTemplate(templateId, now);
  expect(firstEntry(id).progression).toMatchObject({
    mode: 'weight-first',
    suggestions: [
      { weightKilograms: 142.5, reps: 8 },
      { weightKilograms: 142.5, reps: 8 },
      { weightKilograms: 142.5, reps: 8 },
    ],
  });
  db.run("UPDATE templateExercise SET progression = 'double'");
  expect(firstEntry(id).progression).toMatchObject({
    mode: 'reps-first',
    suggestions: [
      { weightKilograms: 140, reps: 9 },
      { weightKilograms: 140, reps: 9 },
      { weightKilograms: 140, reps: 9 },
    ],
  });
});

test('three normal sessions hold a load jump; a deload between them is skipped', () => {
  const oldest = history('2026-10-01', templateId);
  db.run(
    'UPDATE workoutSet SET rpe = 7 WHERE workoutExerciseId IN (SELECT id FROM workoutExercise WHERE workoutId = ?)',
    [oldest],
  );
  history('2026-10-08', templateId);
  const deload = history('2026-10-12', templateId, 3);
  db.run('UPDATE workoutExercise SET deloadStage = 2 WHERE workoutId = ?', [deload]);
  history('2026-10-15', templateId);
  const id = logger.startFromTemplate(templateId, now);
  expect(firstEntry(id).progression?.suggestions).toMatchObject([
    { weightKilograms: 100, reps: 12, reason: 'rpe-rising' },
    { weightKilograms: 100, reps: 12, reason: 'rpe-rising' },
    { weightKilograms: 100, reps: 12, reason: 'rpe-rising' },
  ]);
});

test('latest deload is skipped for baseline, new deload takes priority, and completed cells stay excluded', () => {
  history('2026-10-01', templateId, 10);
  const deload = history('2026-10-20', templateId, 6);
  db.run('UPDATE workoutExercise SET deloadStage = 2 WHERE workoutId = ?', [deload]);
  db.run(
    'UPDATE workoutSet SET weightKilograms = 90 WHERE workoutExerciseId IN (SELECT id FROM workoutExercise WHERE workoutId = ?)',
    [deload],
  );
  const id = logger.startFromTemplate(templateId, now);
  const current = firstEntry(id);
  expect(current.previous[0]).toMatchObject({ weightKilograms: 100, reps: 10 });
  expect(current.sets[0]).toMatchObject({ weightKilograms: 100, reps: 10 });
  expect(current.progression?.suggestions[0]).toMatchObject({ weightKilograms: 100, reps: 11 });
  const set = current.sets[0];
  if (set === undefined) throw new Error('Missing set');
  logger.setCompleted(set.id, true, now);
  expect(firstEntry(id).progression?.suggestions).toHaveLength(2);
  logger.setDeloadStage(current.entry.id, 1);
  expect(firstEntry(id).progression).toBeUndefined();
});

test('copy, update from session, and backup preserve explicit modes', async () => {
  db.run("UPDATE templateExercise SET progressionMode = 'off'");
  const copy = TemplateStore.duplicate(db, templateId, now);
  expect(TemplateCatalog.detail(db, copy)?.exercises[0]?.progressionMode).toBe('off');
  const old = history('2026-10-01', templateId);
  TemplateStore.updateFromWorkout(db, old, now);
  expect(TemplateCatalog.detail(db, templateId)?.exercises[0]?.progressionMode).toBe('off');
  const reloaded = await Database.fromBytes(db.exportBytes());
  try {
    expect(TemplateCatalog.detail(reloaded, templateId)?.exercises[0]?.progressionMode).toBe('off');
  } finally {
    reloaded.close();
  }
});
