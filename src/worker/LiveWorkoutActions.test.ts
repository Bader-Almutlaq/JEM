import { afterEach, expect, test, vi } from 'vitest';

// Cross-layer integration test: the screen's logging actions against the real worker and database.
// A test-only exception to the inward-only layering: it drives the screen's actions against this worker.
import { Database } from '../core/db/Database';
import { loadSqlite } from '../core/db/loadSqlite';
import { migrate } from '../core/db/migrations';
import type { WorkoutSet } from '../core/models/WorkoutSet';
import { completeCheckedSet, saveCell } from '../app/features/workout/workoutActions';
import { loggingQueue } from '../app/features/workout/loggingQueue';
import { OnDeviceStore } from './OnDeviceStore';
import { createWorkerApi, type WorkerApi } from './WorkerApi';
import { MemoryDevice } from './fixtures/MemoryDevice';

const mocked = vi.hoisted(() => ({
  detail: vi.fn<WorkerApi['workoutDetail']>(),
  update: vi.fn<WorkerApi['updateSet']>(),
  finding: vi.fn<WorkerApi['liveSetFinding']>(),
  completed: vi.fn<WorkerApi['setCompleted']>(),
}));
vi.mock('../app/data/database', () => ({
  database: {
    workoutDetail: mocked.detail,
    updateSet: mocked.update,
    liveSetFinding: mocked.finding,
    setCompleted: mocked.completed,
  },
}));
vi.mock('../app/data/dropbox/cloudBackup', () => ({ dropboxBackup: {} }));
afterEach(() => vi.resetAllMocks());

async function setup() {
  const db = await Database.openInMemory();
  migrate(db);
  const device = new MemoryDevice(await loadSqlite());
  device.files.set('/workouts.sqlite', db.exportBytes());
  db.close();
  const store = await OnDeviceStore.open(device.sqlite, new Date('2026-01-12T10:00:00Z'));
  const api = createWorkerApi(Promise.resolve(store));
  const exerciseId = await api.createExercise({ name: 'Synthetic press', primaryMuscles: ['chest'] });
  // Three synthetic sessions satisfy the core check's minimum history requirement.
  for (const name of ['First synthetic', 'Second synthetic', 'Third synthetic']) {
    const previousId = await api.startWorkout(name, [exerciseId]);
    const previous = (await api.liveWorkout())?.entries[0]?.sets[0];
    if (previous === undefined) throw new Error('Missing previous set');
    await api.updateSet(previous.id, 47.5, 'kg', 9, 7.5, 'working', null);
    await api.setCompleted(previous.id, true);
    await api.finishWorkout(previousId);
  }
  const workoutId = await api.startWorkout('Synthetic current', [exerciseId]);
  const entry = (await api.liveWorkout())?.entries[0];
  const set = entry?.sets[0];
  if (entry === undefined || set === undefined) throw new Error('Missing planned set');
  mocked.detail.mockImplementation(api.workoutDetail);
  mocked.update.mockImplementation(api.updateSet);
  mocked.finding.mockImplementation(api.liveSetFinding);
  mocked.completed.mockImplementation(api.setCompleted);
  const read = async (): Promise<WorkoutSet | undefined> =>
    (await api.liveWorkout())?.entries[0]?.sets.find((candidate) => candidate.id === set.id);
  const drain = () => loggingQueue.enqueue(async () => undefined);
  return { store, api, workoutId, exerciseId, entry, set, read, drain };
}

test('ticking an untouched greyed set uses its prefilled weight, reps and RPE with the existing typo check', async () => {
  const context = await setup();
  try {
    const prompt = vi.fn();
    completeCheckedSet(context.workoutId, context.exerciseId, context.set.id, prompt);
    await context.drain();
    expect(prompt).not.toHaveBeenCalled();
    expect(await context.read()).toMatchObject({ weightKilograms: 47.5, reps: 9, rpe: 7.5, isCompleted: true });
    expect(mocked.finding).toHaveBeenCalledWith(context.exerciseId, 47.5, 9, 'working', context.workoutId);
    expect(mocked.update).not.toHaveBeenCalled();
  } finally {
    context.store.database.close();
  }
});

test('accepting a suggestion then ticking saves in tap order without losing other fields', async () => {
  const context = await setup();
  try {
    saveCell(context.workoutId, { setId: context.set.id, field: 'weight' }, 50, 'weight-reps');
    saveCell(context.workoutId, { setId: context.set.id, field: 'reps' }, 10, 'weight-reps');
    completeCheckedSet(context.workoutId, context.exerciseId, context.set.id, vi.fn());
    await context.drain();
    expect(await context.read()).toMatchObject({ weightKilograms: 50, reps: 10, rpe: 7.5, isCompleted: true });
  } finally {
    context.store.database.close();
  }
});

test('a suspicious accepted value still prompts and does not complete', async () => {
  const context = await setup();
  try {
    const prompt = vi.fn();
    saveCell(context.workoutId, { setId: context.set.id, field: 'weight' }, 475, 'weight-reps');
    completeCheckedSet(context.workoutId, context.exerciseId, context.set.id, prompt);
    await context.drain();
    expect(prompt).toHaveBeenCalledOnce();
    expect(await context.read()).toMatchObject({ weightKilograms: 475, reps: 9, isCompleted: false });
  } finally {
    context.store.database.close();
  }
});
