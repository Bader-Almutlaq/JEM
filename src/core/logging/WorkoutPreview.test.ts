import { afterEach, beforeEach, expect, test } from 'vitest';
import { Database } from '../db/Database';
import { migrate } from '../db/migrations';
import type { SetKind } from '../models/SetKind';
import { liveWorkoutSnapshot, type LiveWorkoutSnapshot } from '../queries/LiveWorkout';
import { TemplateStore } from '../templates/TemplateStore';
import { WorkoutLogger } from './WorkoutLogger';
import { workoutPreview } from './WorkoutPreview';

const now = new Date('2026-11-02T12:00:00.000Z');
let db: Database;
let templateId: number;

beforeEach(async () => {
  db = await Database.openInMemory();
  migrate(db);
  db.exec(`
    INSERT INTO exercise (id, name, source, equipment, mechanic, movementPattern, warmupSetCount, createdAt)
    VALUES (1, 'Synthetic bench', 'custom', 'barbell', 'compound', 'horizontal-push', 3, '2026-01-01'),
           (2, 'Synthetic press', 'custom', 'machine', 'compound', 'horizontal-push', NULL, '2026-01-01');
    INSERT INTO exercise (id, name, source, tracking, createdAt)
    VALUES (3, 'Synthetic hold', 'custom', 'duration', '2026-01-01');
  `);
  const targets = (kinds: readonly SetKind[]) =>
    kinds.map((kind) => ({
      kind,
      targetRepsLow: 8,
      targetRepsHigh: 10,
      targetRpe: 8,
      targetRpeHigh: 9,
    }));
  templateId = TemplateStore.save(
    db,
    {
      name: 'Synthetic push',
      folderId: null,
      notes: 'Workout description',
      exercises: [
        { exerciseId: 1, supersetGroup: null, notes: 'Pause', sets: targets(['warmup', 'working', 'drop']) },
        {
          exerciseId: 2,
          supersetGroup: 1,
          notes: null,
          machineBrand: 'Technogym',
          progression: 'double',
          sets: targets(['working', 'working']),
        },
        {
          exerciseId: 2,
          supersetGroup: 1,
          notes: null,
          machineBrand: 'Technogym',
          progression: 'double',
          sets: targets(['working']),
        },
        { exerciseId: 3, supersetGroup: null, notes: null, sets: targets(['working']) },
      ],
    },
    now,
  );
});
afterEach(() => db.close());

function history(date: string, deload: boolean, linkedTemplate: number | null = templateId, brand = 'Technogym') {
  const workout = db.run(
    `
    INSERT INTO workout (name, startedAt, endedAt, source, templateId)
    VALUES ('Synthetic history', ?, ?, 'app', ?)
  `,
    [date, date, linkedTemplate],
  ).lastInsertRowId;
  for (const [position, exerciseId] of [1, 2, 2].entries()) {
    if (exerciseId === 1 && linkedTemplate === null) continue;
    const entry = db.run(
      `
      INSERT INTO workoutExercise (workoutId, exerciseId, position, machineBrand, deloadStage,
        deloadMode, deloadLoadPercent, deloadSetPercent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        workout,
        exerciseId,
        position,
        exerciseId === 2 ? brand : null,
        exerciseId === 1 && deload ? 1 : null,
        exerciseId === 1 && deload ? 'both' : null,
        exerciseId === 1 && deload ? 20 : null,
        exerciseId === 1 && deload ? 50 : null,
      ],
    ).lastInsertRowId;
    const kinds =
      exerciseId === 1 ? ['warmup', 'working', 'drop'] : position === 1 ? ['working', 'working'] : ['working'];
    for (const [setPosition, kind] of kinds.entries()) {
      const load = exerciseId === 1 ? (kind === 'warmup' ? 20 : deload ? 96 : 120) : position === 1 ? 1000 : 900;
      db.run(
        `
        INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps, rpe, isCompleted)
        VALUES (?, ?, ?, ?, 'kg', ?, 9, 1)
      `,
        [entry, setPosition, kind, load, position === 2 ? 9 : 10],
      );
    }
  }
}

function comparable(snapshot: LiveWorkoutSnapshot) {
  return {
    workout: { ...snapshot.workout, id: 0 },
    entries: snapshot.entries.map((item) => ({
      ...item,
      entry: { ...item.entry, id: 0, workoutId: 0 },
      sets: item.sets.map((set) => ({ ...set, id: set.position, workoutExerciseId: 0 })),
      progression:
        item.progression === undefined
          ? undefined
          : {
              ...item.progression,
              suggestions: item.progression.suggestions.map((suggestion) => ({
                ...suggestion,
                setId: item.sets.find((set) => set.id === suggestion.setId)?.position,
              })),
            },
      deload:
        item.deload === undefined
          ? undefined
          : {
              ...item.deload,
              suggestions: item.deload.suggestions.map((suggestion) => ({
                ...suggestion,
                setId: item.sets.find((set) => set.id === suggestion.setId)?.position,
              })),
            },
    })),
  };
}

function expectStartMatches() {
  const preview = workoutPreview(db, templateId, now);
  const logger = new WorkoutLogger(db);
  const started = liveWorkoutSnapshot(db, logger.startFromTemplate(templateId, now));
  expect(started).toBeDefined();
  if (started === undefined) throw new Error('Missing started workout');
  expect(comparable(preview)).toEqual(comparable(started));
  expect(
    preview.entries.map((entry) =>
      entry.sets.filter((set) => preview.suggestedWarmupSetIds.includes(set.id)).map((set) => set.position),
    ),
  ).toEqual(
    started.entries.map((entry) =>
      entry.sets
        .filter((set) => logger.suggestedWarmupSetIds(entry.entry.id).includes(set.id))
        .map((set) => set.position),
    ),
  );
  return preview;
}

test('preview writes nothing and equals Start with warm-ups, drop sets, repeated machines, deload and progression', () => {
  history('2026-10-01', false);
  history('2026-10-15', true);
  history('2026-10-25', false, null, 'Other machine');
  const before = db.exportBytes();
  const changes = db.value<number>('SELECT total_changes()');
  const stamps = db.all<{ updatedAt: string }>('SELECT updatedAt FROM template');
  const preview = workoutPreview(db, templateId, now);
  expect(db.exportBytes()).toEqual(before);
  expect(db.value<number>('SELECT total_changes()')).toBe(changes);
  expect(db.all('SELECT updatedAt FROM template')).toEqual(stamps);
  expect(db.value<number>('SELECT COUNT(*) FROM workout')).toBe(3);
  expect(preview.entries[0]?.entry.deloadStage).toBe(2);
  expect(preview.entries[1]?.entry.machineBrand).toBe('Technogym');
  expect(preview.entries[1]?.sets[0]?.weightKilograms).toBe(1000);
  expect(preview.entries[2]?.sets[0]?.weightKilograms).toBe(900);
  expect(preview.entries[1]?.progression?.suggestions.length).toBeGreaterThan(0);
  expect(preview.entries[0]?.sets.map((set) => set.kind)).toEqual(['warmup', 'warmup', 'warmup', 'working', 'drop']);
  expectStartMatches();
});

test('in-progress deload builds back with the same stage, baseline and suggestions as Start', () => {
  history('2026-10-01', false);
  history('2026-10-15', true);
  const preview = expectStartMatches();
  expect(preview.entries[0]?.entry).toMatchObject({ deloadStage: 2, deloadMode: 'load', deloadLoadPercent: 20 });
  expect(preview.entries[0]?.sets[3]?.weightKilograms).toBe(96);
  expect(preview.entries[0]?.deload?.suggestions[0]).toMatchObject({ weightKilograms: 107.5, reps: 10 });
});

test.each([null, 0, 2])('manual and generated warm-ups (override %s) and no-history seconds match Start', (count) => {
  db.run('UPDATE exercise SET warmupSetCount = ? WHERE id = 1', [count]);
  const preview = expectStartMatches();
  expect(preview.entries[0]?.sets.filter((set) => set.kind === 'warmup')).toHaveLength(count === null ? 1 : 0);
  expect(preview.entries[3]?.sets[0]).toMatchObject({ reps: 0, durationSeconds: 8 });
  expect(preview.entries[1]?.progression?.suggestions).toEqual([]);
});

test('machine fallback suppresses progression and preview remains available during an active workout', () => {
  history('2026-10-01', false, templateId, 'Other machine');
  new WorkoutLogger(db).start('Already active', now);
  const before = db.exportBytes();
  const preview = workoutPreview(db, templateId, now);
  expect(db.exportBytes()).toEqual(before);
  expect(preview.entries[1]?.previousOtherMachine).toBe(true);
  expect(preview.entries[1]?.progression?.suggestions).toEqual([]);
});

test('empty templates preview without writes; missing templates have Start’s readable error', () => {
  db.run('DELETE FROM templateExercise WHERE templateId = ?', [templateId]);
  expect(workoutPreview(db, templateId, now).entries).toEqual([]);
  const before = db.exportBytes();
  expect(() => workoutPreview(db, -1, now)).toThrow('That workout or plan no longer exists.');
  expect(db.exportBytes()).toEqual(before);
});
