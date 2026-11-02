import { describe, expect, test } from 'vitest';
import { Database } from '../db/Database';
import { migrate } from '../db/migrations';
import {
  RestTimerDefaults,
  clampedRestTarget,
  restState,
  restRangeState,
  restTarget,
  setRestTarget,
  steppedRestTarget,
} from './RestTimer';
import { WorkoutLoggerError } from './WorkoutLoggerError';

const completedAt = '2026-02-01T10:00:00.000Z';
const secondsAfter = (seconds: number) => new Date(Date.parse(completedAt) + seconds * 1000);

async function fixture() {
  const db = await Database.openInMemory();
  migrate(db);
  db.exec(`INSERT INTO exercise (id, name, source, createdAt) VALUES (1, 'Squat (Barbell)', 'custom', '2026-01-01');`);
  return db;
}
const storedTarget = (db: Database) =>
  db.value<number | null>('SELECT restTargetSeconds FROM exercise WHERE id = 1') ?? null;

describe('restState', () => {
  test('counts up from the completed set and counts down to the target', () => {
    expect(restState(completedAt, 120, secondsAfter(84))).toEqual({
      elapsedSeconds: 84,
      remainingSeconds: 36,
      isTargetReached: false,
    });
  });

  test('reaches the target exactly at the target time', () => {
    expect(restState(completedAt, 120, secondsAfter(120))).toEqual({
      elapsedSeconds: 120,
      remainingSeconds: 0,
      isTargetReached: true,
    });
  });

  test('keeps counting up past the target while remaining stays at zero', () => {
    const state = restState(completedAt, 120, secondsAfter(200));
    expect(state.elapsedSeconds).toBe(200);
    expect(state.remainingSeconds).toBe(0);
    expect(state.isTargetReached).toBe(true);
  });

  test('reads zero elapsed when the clock is behind the completion time', () => {
    expect(restState(completedAt, 120, secondsAfter(-5))).toEqual({
      elapsedSeconds: 0,
      remainingSeconds: 120,
      isTargetReached: false,
    });
  });

  test('is derived from timestamps only, so a later reload gives the same answer', () => {
    expect(restState(completedAt, 90, secondsAfter(45))).toEqual(restState(completedAt, 90, secondsAfter(45)));
  });
});

describe('Rest target', () => {
  test('uses the default until the owner chooses one', () => {
    expect(restTarget({ restTargetSeconds: null })).toBe(RestTimerDefaults.targetSeconds);
    expect(restTarget({ restTargetSeconds: 180 })).toBe(180);
  });

  test('steps by the step size in either direction', () => {
    expect(steppedRestTarget(120, 1)).toBe(120 + RestTimerDefaults.stepSeconds);
    expect(steppedRestTarget(120, -1)).toBe(120 - RestTimerDefaults.stepSeconds);
  });

  test('stops at the limits', () => {
    expect(steppedRestTarget(RestTimerDefaults.minimumSeconds, -1)).toBe(RestTimerDefaults.minimumSeconds);
    expect(steppedRestTarget(RestTimerDefaults.maximumSeconds, 1)).toBe(RestTimerDefaults.maximumSeconds);
  });

  test('rounds to whole seconds and clamps', () => {
    expect(clampedRestTarget(90.4)).toBe(90);
    expect(clampedRestTarget(0)).toBe(RestTimerDefaults.minimumSeconds);
    expect(clampedRestTarget(99999)).toBe(RestTimerDefaults.maximumSeconds);
  });
});

describe('setRestTarget', () => {
  test('remembers the target for the exercise', async () => {
    const db = await fixture();
    expect(storedTarget(db)).toBeNull();
    setRestTarget(db, 1, 150);
    expect(storedTarget(db)).toBe(150);
    setRestTarget(db, 1, 165);
    expect(storedTarget(db)).toBe(165);
  });

  test('keeps the stored value within the limits', async () => {
    const db = await fixture();
    setRestTarget(db, 1, 1);
    expect(storedTarget(db)).toBe(RestTimerDefaults.minimumSeconds);
    setRestTarget(db, 1, 100000);
    expect(storedTarget(db)).toBe(RestTimerDefaults.maximumSeconds);
  });

  test('refuses an exercise that does not exist', async () => {
    const db = await fixture();
    expect(() => setRestTarget(db, 99, 120)).toThrow(WorkoutLoggerError);
  });
});

test('nonfinite rest targets cannot silently clear or replace the owner choice', async () => {
  const db = await Database.openInMemory();
  migrate(db);
  db.exec(`INSERT INTO exercise (id, name, source, createdAt, restTargetSeconds)
    VALUES (1, 'Synthetic', 'custom', 'a', 135)`);
  for (const seconds of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    expect(() => setRestTarget(db, 1, seconds)).toThrow(new WorkoutLoggerError('invalidRestTarget', seconds));
    expect(db.value('SELECT restTargetSeconds FROM exercise WHERE id = 1')).toBe(135);
  }
  db.close();
});

test('range phases switch at each boundary and single targets finish at the low end', () => {
  expect(restRangeState(119, 120, 180)).toEqual({ phase: 'before', overtimeSeconds: 0 });
  expect(restRangeState(120, 120, 180)).toEqual({ phase: 'between', overtimeSeconds: 0 });
  expect(restRangeState(140, 120, 180)).toEqual({ phase: 'between', overtimeSeconds: 20 });
  expect(restRangeState(180, 120, 180)).toEqual({ phase: 'finished', overtimeSeconds: 60 });
  expect(restRangeState(120, 120, null).phase).toBe('finished');
});

test('editing a single rest target keeps the upper bound valid', async () => {
  const db = await fixture();
  db.run('UPDATE exercise SET restTargetSeconds = 120, restMaxSeconds = 180 WHERE id = 1');
  setRestTarget(db, 1, 150);
  expect(db.value('SELECT restMaxSeconds FROM exercise WHERE id = 1')).toBe(180);
  setRestTarget(db, 1, 195);
  expect(db.value('SELECT restMaxSeconds FROM exercise WHERE id = 1')).toBe(195);
});
