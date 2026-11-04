import { describe, expect, test } from 'vitest';
import { rpeNumberText, rpeText, setCountText, setLabels, warmupCountText } from './setText';

describe('set text', () => {
  test('Special sets get letters and do not use up a number', () => {
    const kinds = ['warmup', 'working', 'working', 'drop', 'failure', 'working'] as const;
    expect(setLabels(kinds.map((kind) => ({ kind })))).toEqual(['W', '1', '2', 'D', 'F', '3']);
  });

  test('RPE keeps half steps only', () => {
    expect(rpeText(8)).toBe('RPE 8');
    expect(rpeText(8.5)).toBe('RPE 8.5');
  });

  test('Set count is singular for one', () => {
    expect(setCountText(1)).toBe('1 set');
    expect(setCountText(0)).toBe('0 sets');
    expect(setCountText(12)).toBe('12 sets');
  });

  test('An RPE number has no unit and no trailing zero', () => {
    expect(rpeNumberText(8)).toBe('8');
    expect(rpeNumberText(8.5)).toBe('8.5');
  });
});

test('warm-up counts are singular for one and plural otherwise', () => {
  expect([warmupCountText(1), warmupCountText(3), warmupCountText(0)]).toEqual([
    '1 warm-up',
    '3 warm-ups',
    '0 warm-ups',
  ]);
});
