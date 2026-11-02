import { beforeEach, describe, expect, it } from 'vitest';
import { Database } from '../db/Database';
import { DataSafetyFixture } from '../db/fixtures/DataSafetyFixture';
import { migrate } from '../db/migrations';
import { TemplateCatalog } from '../queries/TemplateCatalog';
import { TemplateStore } from './TemplateStore';
import type { TemplateDraft } from './TemplateDraft';

const now = new Date('2026-01-01T00:00:00Z');
const draft: TemplateDraft = {
  name: 'Push',
  folderId: null,
  notes: 'notes',
  exercises: [
    {
      exerciseId: 1,
      supersetGroup: 2,
      notes: 'entry',
      sets: [{ kind: 'working', targetRepsLow: 5, targetRepsHigh: 8, targetRpe: 8 }],
    },
  ],
};
let db: Database;
beforeEach(async () => {
  db = await Database.openInMemory();
  migrate(db);
  db.exec(`INSERT INTO exercise (id, name, source, createdAt) VALUES (1, 'Bench', 'custom', '2026-01-01')`);
});
describe('template store', () => {
  it('creates, renames, reorders and deletes folders while preserving template order', () => {
    const first = TemplateStore.createFolder(db, 'First');
    const second = TemplateStore.createFolder(db, 'Second');
    TemplateStore.renameFolder(db, first, 'Renamed');
    TemplateStore.reorderFolder(db, second, 0);
    const unfiled = TemplateStore.save(db, draft, now);
    const a = TemplateStore.save(db, { ...draft, name: 'A', folderId: first }, now);
    const b = TemplateStore.save(db, { ...draft, name: 'B', folderId: first }, now);
    TemplateStore.reorder(db, b, 0);
    expect(TemplateCatalog.list(db).folders.map((folder) => folder.name)).toEqual(['Second', 'Renamed']);
    TemplateStore.deleteFolder(db, first);
    expect(TemplateCatalog.list(db).unfiled.map((item) => item.id)).toEqual([unfiled, b, a]);
  });
  it('saves, replaces, renames, moves, duplicates and deletes templates', () => {
    const folder = TemplateStore.createFolder(db, 'Folder');
    const id = TemplateStore.save(db, draft, now);
    TemplateStore.save(
      db,
      {
        ...draft,
        id,
        notes: null,
        exercises: [
          {
            ...draft.exercises[0],
            exerciseId: 1,
            supersetGroup: null,
            notes: null,
            sets: [{ kind: 'drop', targetRepsLow: null, targetRepsHigh: null, targetRpe: null }],
          },
        ],
      },
      now,
    );
    TemplateStore.rename(db, id, 'New', now);
    TemplateStore.move(db, id, folder);
    const copy = TemplateStore.duplicate(db, id, now);
    expect(TemplateCatalog.detail(db, copy)).toMatchObject({
      name: 'New copy',
      folderId: folder,
      exercises: [{ sets: [{ kind: 'drop' }] }],
    });
    TemplateStore.delete(db, id);
    expect(TemplateCatalog.list(db).folders[0]?.templates.map((item) => item.id)).toEqual([copy]);
  });
  it('rejects invalid drafts atomically', () => {
    const set = draft.exercises[0]?.sets[0];
    if (set === undefined) throw new Error('Missing fixture');
    const exercise = draft.exercises[0];
    if (exercise === undefined) throw new Error('Missing fixture');
    for (const invalid of [
      { ...draft, name: ' ' },
      { ...draft, exercises: [] },
      { ...draft, exercises: [{ ...exercise, sets: [] }] },
      { ...draft, exercises: [{ ...exercise, sets: [{ ...set, targetRepsHigh: 4 }] }] },
      { ...draft, exercises: [{ ...exercise, sets: [{ ...set, targetRpe: 11 }] }] },
    ])
      expect(() => TemplateStore.save(db, invalid, now)).toThrow();
    expect(db.value('SELECT COUNT(*) FROM template')).toBe(0);
  });
  it('copies a finished workout with unspecified targets', () => {
    db.exec(`INSERT INTO workout (id, startedAt, endedAt, name, source) VALUES (1, '2025-01-01', '2025-01-02', 'Old', 'app');
      INSERT INTO workoutExercise (id, workoutId, exerciseId, position, supersetGroup) VALUES (1, 1, 1, 0, 3);
      INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps) VALUES (1, 0, 'failure', 30, 'kg', 5);`);
    const id = TemplateStore.createFromWorkout(db, 1, 'Copy', null, now);
    expect(TemplateCatalog.detail(db, id)?.exercises).toMatchObject([
      { supersetGroup: 3, sets: [{ kind: 'failure', targetRepsLow: null, targetRepsHigh: null, targetRpe: null }] },
    ]);
    expect(() => TemplateStore.createFromWorkout(db, 99, 'Missing', null, now)).toThrow();
  });
  it('links unlinked finished sessions with the same name to the new template', () => {
    db.exec(`INSERT INTO workout (id, startedAt, endedAt, name, source) VALUES
        (1, '2025-01-01', '2025-01-01T01:00', 'Push Day', 'strong'),
        (2, '2025-01-08', '2025-01-08T01:00', ' push day ', 'strong'),
        (3, '2025-01-09', '2025-01-09T01:00', 'Pull Day', 'strong');
      INSERT INTO workoutExercise (id, workoutId, exerciseId, position) VALUES (1, 1, 1, 0), (2, 3, 1, 0);
      INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps) VALUES
        (1, 0, 'working', 30, 'kg', 5), (2, 0, 'working', 30, 'kg', 5);`);
    const other = TemplateStore.createFromWorkout(db, 3, 'Pull Day', null, now);
    db.run('UPDATE workout SET templateId = ? WHERE id = 2', [other]);
    db.run(
      "INSERT INTO workout (id, startedAt, endedAt, name, source) VALUES (4, '2025-01-15', '2025-01-15T01:00', 'Push day', 'strong')",
    );
    const id = TemplateStore.createFromWorkout(db, 1, 'Monday push', null, now);
    const linked = db.all<{ id: number; templateId: number | null }>('SELECT id, templateId FROM workout ORDER BY id');
    expect(linked).toEqual([
      { id: 1, templateId: id },
      { id: 2, templateId: other },
      { id: 3, templateId: other },
      { id: 4, templateId: id },
    ]);
  });
});

it('deleting a folder preserves template children; deleting its template preserves workout history', async () => {
  db.close();
  db = await Database.openInMemory();
  migrate(db);
  DataSafetyFixture.seed(db);
  const before = DataSafetyFixture.read(db);
  TemplateStore.deleteFolder(db, 1);
  const afterFolder = DataSafetyFixture.read(db);
  expect(afterFolder.templateExercise).toEqual(before.templateExercise);
  expect(afterFolder.templateSet).toEqual(before.templateSet);
  expect(afterFolder.workout).toEqual(before.workout);
  expect(afterFolder.template).toEqual(before.template?.map((row) => ({ ...row, folderId: null })));
  TemplateStore.delete(db, 1);
  const afterTemplate = DataSafetyFixture.read(db);
  expect(afterTemplate.workout).toEqual(before.workout?.map((row) => ({ ...row, templateId: null })));
  for (const name of ['workoutExercise', 'workoutSet', 'exercise', 'exerciseAlias', 'bodyMeasurement', 'appSetting']) {
    expect(afterTemplate[name]).toEqual(before[name]);
  }
  expect(afterTemplate.templateExercise).toEqual([]);
  expect(afterTemplate.templateSet).toEqual([]);
  db.close();
});

it('a replacement template that fails after deleting its children rolls back every original field', () => {
  const id = TemplateStore.save(db, draft, now);
  const before = DataSafetyFixture.read(db);
  const entry = draft.exercises[0];
  if (entry === undefined) throw new Error('Missing fixture exercise');
  expect(() =>
    TemplateStore.save(
      db,
      {
        ...draft,
        id,
        name: 'Must roll back',
        exercises: [entry, { ...entry, exerciseId: -1 }],
      },
      now,
    ),
  ).toThrow();
  expect(DataSafetyFixture.read(db)).toEqual(before);
});

it('preserves normalized machine brands through template save, edit, duplication and workout copy', () => {
  const exercise = draft.exercises[0];
  if (exercise === undefined) throw new Error('Missing fixture');
  const id = TemplateStore.save(
    db,
    { ...draft, exercises: [{ ...exercise, machineBrand: ' hammer   strength ' }] },
    now,
  );
  const saved = TemplateCatalog.detail(db, id);
  if (saved === undefined) throw new Error('Missing template');
  expect(saved.exercises[0]?.machineBrand).toBe('Hammer Strength');
  TemplateStore.save(db, { ...saved, name: 'Edited' }, now);
  const copy = TemplateStore.duplicate(db, id, now);
  expect(TemplateCatalog.detail(db, copy)?.exercises[0]?.machineBrand).toBe('Hammer Strength');
  db.exec(`INSERT INTO workout (id, startedAt, endedAt, name, source) VALUES (1, '2025-01-01', '2025-01-02', 'Old', 'app');
    INSERT INTO workoutExercise (id, workoutId, exerciseId, position, machineBrand) VALUES (1, 1, 1, 0, 'Panatta');
    INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps) VALUES (1, 0, 'working', 30, 'kg', 5);`);
  const fromWorkout = TemplateStore.createFromWorkout(db, 1, 'Copy', null, now);
  expect(TemplateCatalog.detail(db, fromWorkout)?.exercises[0]?.machineBrand).toBe('Panatta');
});

it('preserves weekdays across save, edit and duplicate, and clears a deleted active plan', () => {
  const folder = TemplateStore.createFolder(db, 'Plan');
  const id = TemplateStore.save(db, { ...draft, folderId: folder, weekday: 6 }, now);
  const saved = TemplateCatalog.detail(db, id);
  expect(saved?.weekday).toBe(6);
  if (saved === undefined) throw new Error('Missing template');
  TemplateStore.save(db, { ...saved, name: 'Edited' }, now);
  const copy = TemplateStore.duplicate(db, id, now);
  expect(TemplateCatalog.detail(db, copy)?.weekday).toBe(6);
  db.run('INSERT INTO appSetting (key, value) VALUES (?, ?)', ['activePlanId', String(folder)]);
  TemplateStore.deleteFolder(db, folder);
  expect(db.value('SELECT value FROM appSetting WHERE key = ?', ['activePlanId'])).toBeUndefined();
});

it('updates a linked template from a finished session, retaining targets by set type and position', () => {
  db.exec(`INSERT INTO exercise (id, name, source, createdAt) VALUES
    (2, 'Removed', 'custom', '2026-01-01'), (3, 'Added', 'custom', '2026-01-01')`);
  const entry = draft.exercises[0];
  if (entry === undefined) throw new Error('Missing fixture');
  const templateId = TemplateStore.save(db, { ...draft, exercises: [entry, { ...entry, exerciseId: 2 }] }, now);
  db.run(
    `INSERT INTO workout (id, startedAt, endedAt, name, source, templateId)
    VALUES (1, '2025-01-01', '2025-01-02', 'Session', 'app', ?)`,
    [templateId],
  );
  db.exec(`INSERT INTO workoutExercise (id, workoutId, exerciseId, position) VALUES (1, 1, 1, 0), (2, 1, 3, 1);
    INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps) VALUES
      (1, 0, 'failure', 30, 'kg', 5), (1, 1, 'drop', 20, 'kg', 8), (2, 0, 'warmup', 10, 'kg', 8)`);
  TemplateStore.updateFromWorkout(db, 1, now);
  expect(TemplateCatalog.detail(db, templateId)?.exercises).toMatchObject([
    {
      exerciseId: 1,
      sets: [
        { kind: 'failure', targetRepsLow: 5, targetRepsHigh: 8, targetRpe: 8 },
        { kind: 'drop', targetRepsLow: 5, targetRepsHigh: 8, targetRpe: 8 },
      ],
    },
    { exerciseId: 3, sets: [{ kind: 'warmup', targetRepsLow: null, targetRepsHigh: null, targetRpe: null }] },
  ]);
});

it('keeps working targets in place when a session adds a warm-up before them', () => {
  const entry = draft.exercises[0];
  if (entry === undefined) throw new Error('Missing fixture');
  const templateId = TemplateStore.save(db, draft, now);
  db.run(
    `INSERT INTO workout (id, startedAt, endedAt, name, source, templateId)
    VALUES (1, '2025-01-01', '2025-01-02', 'Session', 'app', ?)`,
    [templateId],
  );
  db.exec(`INSERT INTO workoutExercise (id, workoutId, exerciseId, position) VALUES (1, 1, 1, 0);
    INSERT INTO workoutSet (workoutExerciseId, position, kind, weightKilograms, entryUnit, reps) VALUES
      (1, 0, 'warmup', 20, 'kg', 8), (1, 1, 'working', 30, 'kg', 5)`);
  TemplateStore.updateFromWorkout(db, 1, now);
  const planned = entry.sets.find((set) => set.kind !== 'warmup');
  expect(TemplateCatalog.detail(db, templateId)?.exercises[0]?.sets).toMatchObject([
    { kind: 'warmup', targetRepsLow: null, targetRepsHigh: null, targetRpe: null },
    {
      kind: 'working',
      targetRepsLow: planned?.targetRepsLow ?? null,
      targetRepsHigh: planned?.targetRepsHigh ?? null,
      targetRpe: planned?.targetRpe ?? null,
    },
  ]);
});

it('saves and duplicates an RPE range and rejects invalid upper bounds', () => {
  const exercise = draft.exercises[0];
  const set = exercise?.sets[0];
  if (exercise === undefined || set === undefined) throw new Error('Missing fixture');
  const ranged = { ...draft, exercises: [{ ...exercise, sets: [{ ...set, targetRpeHigh: 9 }] }] };
  const id = TemplateStore.save(db, ranged, now);
  const copy = TemplateStore.duplicate(db, id, now);
  expect(TemplateCatalog.detail(db, copy)?.exercises[0]?.sets[0]?.targetRpeHigh).toBe(9);
  expect(() =>
    TemplateStore.save(db, { ...draft, exercises: [{ ...exercise, sets: [{ ...set, targetRpeHigh: 7 }] }] }, now),
  ).toThrow();
});

it('saves rest ranges from the editor and rejects an invalid one atomically', () => {
  const exercise = draft.exercises[0];
  if (exercise === undefined) throw new Error('Missing fixture');
  const id = TemplateStore.save(
    db,
    { ...draft, exercises: [{ ...exercise, restRange: { low: 120, high: 180 } }] },
    now,
  );
  expect(db.get('SELECT restTargetSeconds, restMaxSeconds FROM exercise WHERE id = 1')).toEqual({
    restTargetSeconds: 120,
    restMaxSeconds: 180,
  });
  expect(() =>
    TemplateStore.save(db, { ...draft, id, exercises: [{ ...exercise, restRange: { low: 200, high: 150 } }] }, now),
  ).toThrow();
  expect(db.value('SELECT restTargetSeconds FROM exercise WHERE id = 1')).toBe(120);
});
