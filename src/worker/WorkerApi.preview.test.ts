import { expect, test, vi } from 'vitest';
import { Database } from '../core/db/Database';
import { loadSqlite } from '../core/db/loadSqlite';
import { migrate } from '../core/db/migrations';
import { TemplateSessionsFixture } from '../core/queries/fixtures/TemplateSessionsFixture';
import { MemoryDevice } from './fixtures/MemoryDevice';
import { OnDeviceStore } from './OnDeviceStore';
import { createWorkerApi } from './WorkerApi';

test('preview worker method reads while another workout is active without writes, snapshots or notifications', async () => {
  const db = await Database.openInMemory();
  migrate(db);
  TemplateSessionsFixture.seed(db);
  db.exec(`
    INSERT INTO templateSet (templateExerciseId, position, kind)
    SELECT id, 0, 'working' FROM templateExercise WHERE templateId = 1;
  `);
  const device = new MemoryDevice(await loadSqlite());
  device.files.set('/workouts.sqlite', db.exportBytes());
  db.close();
  const store = await OnDeviceStore.open(device.sqlite, new Date('2026-11-02T12:00:00Z'));
  try {
    const api = createWorkerApi(Promise.resolve(store));
    const listener = vi.fn();
    api.subscribe(listener);
    const snapshots = store.snapshotNames();
    const before = store.database.exportBytes();
    const preview = await api.previewWorkout(1);
    expect(preview.workout.templateId).toBe(1);
    expect(preview.entries).toHaveLength(2);
    expect(preview.entries[0]?.sets[0]?.weightKilograms).toBe(60);
    expect(preview.entries[0]?.previous).toEqual(await api.templatePreviousPerformance(1, 1, 0, null, false));
    expect(await api.activeWorkoutId()).toBe(6);
    expect(store.database.exportBytes()).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
    expect(store.snapshotNames()).toEqual(snapshots);
  } finally {
    store.database.close();
  }
});
