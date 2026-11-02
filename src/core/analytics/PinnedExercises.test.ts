import { expect, test } from 'vitest';
import { Database } from '../db/Database';
import { MIGRATIONS, migrate } from '../db/migrations';
import { ExerciseEditor } from '../library/ExerciseEditor';
import { validateBackup } from '../backup/BackupValidation';
import { PinnedExercises } from './PinnedExercises';

test('migration, ordering, backup, merge and cascade preserve pins', async () => {
  const db = await Database.openInMemory();
  // Start at v13 explicitly so later migrations do not move this regression's boundary.
  migrate(db, new Date(), MIGRATIONS.slice(0, 13));
  expect(migrate(db)).toEqual(['v14-pinned-exercises', 'v15-lower-traps', 'v16-target-ranges']);
  for (const name of ['First', 'Second', 'Third']) {
    db.run("INSERT INTO exercise (name, source, createdAt) VALUES (?, 'custom', '2024-01-01')", [name]);
  }
  PinnedExercises.pin(db, 1, new Date('2024-01-01'));
  PinnedExercises.pin(db, 2, new Date('2024-01-02'));
  PinnedExercises.move(db, 2, 'up');
  expect(PinnedExercises.list(db).map((pin) => pin.exerciseId)).toEqual([2, 1]);
  const bytes = db.exportBytes();
  await validateBackup(bytes);
  const restored = await Database.fromBytes(bytes);
  expect(PinnedExercises.list(restored)).toEqual(PinnedExercises.list(db));
  ExerciseEditor.merge(db, 1, 3);
  expect(PinnedExercises.list(db).map((pin) => pin.exerciseId)).toEqual([2, 3]);
  db.run('DELETE FROM exercise WHERE id = 3');
  expect(PinnedExercises.list(db).map((pin) => pin.exerciseId)).toEqual([2]);
  PinnedExercises.unpin(db, 2);
  expect(PinnedExercises.list(db)).toEqual([]);
  restored.close();
  db.close();
});
