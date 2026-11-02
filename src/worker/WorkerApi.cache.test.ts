import { describe, expect, test, vi } from 'vitest';
import { Database } from '../core/db/Database';
import { loadSqlite } from '../core/db/loadSqlite';
import { migrate } from '../core/db/migrations';
import { OLDER_LAYOUT } from '../core/import/fixtures/StrongFixtures';
import { makeImportOptions } from '../core/import/StrongImportOptions';
import { seedSyntheticHistory, type SyntheticHistory } from '../core/queries/fixtures/SyntheticHistory';
import { OnDeviceStore } from './OnDeviceStore';
import { createWorkerApi } from './WorkerApi';
import { MemoryDevice } from './fixtures/MemoryDevice';

const END = new Date('2026-10-30T12:00:00.000Z');
/** A whole-history range, as the All period sends it: from before the first workout to after the last. */
const FROM = '2025-01-06T00:00:00.000Z';
const TO = '2026-11-02T00:00:00.000Z';
const LAST = '2026-11-01T23:59:59.999Z';

async function setup() {
  const device = new MemoryDevice(await loadSqlite());
  const db = await Database.openInMemory();
  migrate(db, END);
  const history = seedSyntheticHistory(db, { seed: 11, weeks: 40, exerciseCount: 15, end: END });
  device.files.set('/workouts.sqlite', db.exportBytes());
  db.close();
  const store = await OnDeviceStore.open(device.sqlite, END);
  return { store, history, api: createWorkerApi(Promise.resolve(store)) };
}

type Api = ReturnType<typeof createWorkerApi>;

/** Every cached analytics call, with the arguments the screens send. */
function cachedCalls(api: Api, history: SyntheticHistory) {
  const exercise = history.mostTrainedExerciseId;
  const folderId = history.folderIds.at(-1) ?? 0;
  const templateId = history.templateIds.at(-1) ?? 0;
  return {
    analyticsOverview: () => api.analyticsOverview(FROM, TO, null),
    strengthRanking: () => api.strengthRanking(FROM, TO),
    muscleDashboard: () => api.muscleDashboard(FROM, LAST),
    intensityMix: () => api.intensityMix(FROM, LAST),
    weeklyEffort: () => api.weeklyEffort(FROM, LAST),
    muscleDetail: () => api.muscleDetail(FROM, LAST, 'chest'),
    exerciseEntries: () => api.exerciseEntries(),
    exerciseDetail: () => api.exerciseDetail(exercise),
    exerciseStrength: () => api.exerciseStrength(exercise),
    exerciseProgress: () => api.exerciseProgress(exercise),
    exerciseCharts: () => api.exerciseCharts(exercise),
    exerciseRecords: () => api.exerciseRecords(exercise),
    exerciseRpeChart: () => api.exerciseRpeChart(exercise),
    templatePlan: () => api.templateAnalytics({ folderId }),
    templateWorkout: () => api.templateAnalytics({ templateId }),
    templateSessions: () => api.templateSessions({ folderId }),
  };
}

async function readAll(calls: ReturnType<typeof cachedCalls>): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  for (const [name, call] of Object.entries(calls)) results[name] = await call();
  return results;
}

async function fresh(store: OnDeviceStore, calls: ReturnType<typeof cachedCalls>) {
  store.database.cache.clear();
  return readAll(calls);
}

describe('worker result cache', () => {
  test('repeated calls reuse results that equal a fresh computation', async () => {
    const { store, history, api } = await setup();
    const calls = cachedCalls(api, history);
    const first = await readAll(calls);
    const misses = store.database.cache.statistics().misses;
    const second = await readAll(calls);
    for (const name of ['analyticsOverview', 'muscleDashboard', 'exerciseStrength', 'exerciseDetail'])
      expect(second[name]).toBe(first[name]);
    expect(store.database.cache.statistics().misses).toBe(misses);
    expect(await fresh(store, calls)).toEqual(first);
    store.database.close();
  });

  test('reads leave the data version alone', async () => {
    const { store, history, api } = await setup();
    const before = store.database.dataVersion;
    await readAll(cachedCalls(api, history));
    await api.templateList();
    await api.pinnedExercises();
    expect(store.database.dataVersion).toBe(before);
    store.database.close();
  });

  test('a changed set updates every cached result', async () => {
    const { store, history, api } = await setup();
    const calls = cachedCalls(api, history);
    const before = await readAll(calls);
    store.database.run(
      `UPDATE workoutSet SET weightKilograms = weightKilograms * 1.5, rpe = 10 WHERE id IN (
         SELECT s.id FROM workoutSet s JOIN workoutExercise we ON we.id = s.workoutExerciseId
         WHERE we.exerciseId = ? AND s.kind != 'warmup')`,
      [history.mostTrainedExerciseId],
    );
    const after = await readAll(calls);
    expect(after.exerciseStrength).not.toEqual(before.exerciseStrength);
    expect(after.strengthRanking).not.toEqual(before.strengthRanking);
    expect(after.intensityMix).not.toEqual(before.intensityMix);
    expect(after.templateSessions).not.toEqual(before.templateSessions);
    expect(await fresh(store, calls)).toEqual(after);
    store.database.close();
  });

  test('a write through the worker notifies with a growing data version and refreshes results', async () => {
    const { store, history, api } = await setup();
    const calls = cachedCalls(api, history);
    const listener = vi.fn();
    api.subscribe(listener);
    const before = await readAll(calls);
    const latest = store.database.value<number>(
      'SELECT id FROM workout WHERE isInProgress = 0 ORDER BY startedAt DESC LIMIT 1',
    );
    await api.deletePastWorkout(latest ?? -1);
    await api.pinExercise(history.exerciseIds[0] ?? -1);
    expect(listener.mock.calls).toEqual([[1], [2]]);
    expect(api.dataVersion()).toBe(2);
    const after = await readAll(calls);
    expect(after.analyticsOverview).not.toEqual(before.analyticsOverview);
    expect(await fresh(store, calls)).toEqual(after);
    store.database.close();
  });

  test('an import updates cached results', async () => {
    const { store, history, api } = await setup();
    const calls = cachedCalls(api, history);
    const before = await readAll(calls);
    await api.planStrongImport([{ name: 'synthetic.csv', text: OLDER_LAYOUT }]);
    await api.runStrongImport(makeImportOptions());
    const after = await readAll(calls);
    expect(after.exerciseEntries).not.toEqual(before.exerciseEntries);
    expect(await fresh(store, calls)).toEqual(after);
    store.database.close();
  });

  test('a restore serves the restored data, not results cached before it', async () => {
    const { store, history, api } = await setup();
    const calls = cachedCalls(api, history);
    const backup = await api.exportBackup();
    const original = await readAll(calls);
    const latest = store.database.value<number>(
      'SELECT id FROM workout WHERE isInProgress = 0 ORDER BY startedAt DESC LIMIT 1',
    );
    await api.deletePastWorkout(latest ?? -1);
    const edited = await readAll(calls);
    expect(edited.analyticsOverview).not.toEqual(original.analyticsOverview);
    await api.restoreBackup(backup.bytes);
    expect(await readAll(calls)).toEqual(original);
    store.database.close();
  });
});
