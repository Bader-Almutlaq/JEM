import { expect, test } from 'vitest';
import { Database } from '../db/Database';
import { migrate } from '../db/migrations';
import { seedHistoryFixture } from './fixtures/historyFixture';
import { historyBoundaryKey } from './HistoryBoundary';

test('any time after the newest finished workout shares one key; earlier times key exactly', async () => {
  const db = await Database.openInMemory();
  migrate(db);
  expect(historyBoundaryKey(db, new Date('2020-01-01T00:00:00.000Z'))).toBe('all');
  seedHistoryFixture(db);
  // The fixture's newest workout starts 2024-01-08 10:00 UTC.
  expect(historyBoundaryKey(db, new Date('2024-01-08T10:00:00.000Z'))).toBe('all');
  expect(historyBoundaryKey(db, new Date('2026-05-01T00:00:00.000Z'))).toBe('all');
  expect(historyBoundaryKey(db, new Date('2024-01-05T00:00:00.000Z'))).toBe('2024-01-05T00:00:00.000Z');
  db.run("INSERT INTO workout (startedAt, name, source) VALUES ('2026-06-01T10:00:00.000Z', 'Later', 'app')");
  expect(historyBoundaryKey(db, new Date('2026-05-01T00:00:00.000Z'))).toBe('2026-05-01T00:00:00.000Z');
  db.close();
});
