import { expect, test } from 'vitest';
import { Database } from '../db/Database';
import { migrate } from '../db/migrations';
import { activeWorkoutSummary } from './ActiveWorkoutSummary';

async function openDatabase(): Promise<Database> {
  const db = await Database.openInMemory();
  migrate(db);
  return db;
}

test('returns undefined when no workout is in progress', async () => {
  const db = await openDatabase();
  db.run(
    `INSERT INTO workout (startedAt, name, source, isInProgress) VALUES ('2026-01-01T10:00:00Z', 'Done', 'app', 0)`,
  );
  expect(activeWorkoutSummary(db)).toBeUndefined();
});

test('returns the id, name and start of the workout in progress, ignoring finished ones', async () => {
  const db = await openDatabase();
  db.run(
    `INSERT INTO workout (startedAt, name, source, isInProgress) VALUES ('2026-01-02T10:00:00Z', 'Done', 'app', 0)`,
  );
  db.run(
    `INSERT INTO workout (startedAt, name, source, isInProgress) VALUES ('2026-01-01T10:00:00Z', 'Push', 'app', 1)`,
  );
  expect(activeWorkoutSummary(db)).toEqual({ id: 2, name: 'Push', startedAt: '2026-01-01T10:00:00Z' });
});
