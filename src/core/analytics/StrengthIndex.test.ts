import { expect, test } from 'vitest';
import { medianStrengthChange, strengthChangeCounts, strengthIndex } from './StrengthIndex';

const from = new Date('2024-01-01T00:00:00.000Z');
const to = new Date('2024-01-29T00:00:00.000Z');

function point(day: number, e1rmKilograms: number, deload = false) {
  return { date: `2024-01-${String(day).padStart(2, '0')}T00:00:00.000Z`, e1rmKilograms, deload };
}

test('typical lift gives every lift one vote with odd and even medians', () => {
  expect(medianStrengthChange([3, 1, 2])).toBe(2);
  expect(medianStrengthChange([4, 1, 3, 2])).toBe(2.5);
  expect(medianStrengthChange([NaN, Infinity])).toBeNull();
  expect(medianStrengthChange([])).toBeNull();
});

test('exactly plus and minus one percent are flat', () => {
  expect(strengthChangeCounts([-1.00001, -1, 0, 1, 1.00001, NaN])).toEqual({ up: 1, flat: 3, down: 1 });
});

test('four weeks of three relative lifts include late starts, carry-forward and exclude deloads', () => {
  const points = strengthIndex(
    [
      [point(1, 100), point(7, 102), point(14, 104), point(21, 106), point(28, 108)],
      [point(1, 200), point(7, 198), point(14, 202), point(21, 206), point(28, 210)],
      [point(11, 50), point(21, 55), point(28, 100, true)],
    ],
    from,
    to,
  );
  expect(points).toHaveLength(5);
  for (const [index, expected] of [0, 0.5, 1, 6, 8].entries()) {
    expect(points[index]?.changePercent).toBeCloseTo(expected);
  }
  expect(points.map((value) => value.contributors)).toEqual([2, 2, 3, 3, 3]);
  expect(points[0]?.date).toBe(from.toISOString());
  expect(points.at(-1)?.date).toBe('2024-01-28T23:59:59.999Z');
});

test('uses the last pre-period trend as baseline without looking ahead', () => {
  const points = strengthIndex(
    [
      [
        { date: '2023-12-01T00:00:00Z', e1rmKilograms: 50 },
        { date: '2023-12-31T00:00:00Z', e1rmKilograms: 100 },
        point(7, 110),
        point(29, 900),
      ],
    ],
    from,
    to,
  );
  expect(points[0]?.changePercent).toBe(0);
  expect(points[1]?.changePercent).toBeCloseTo(10);
  expect(points.at(-1)?.changePercent).toBeCloseTo(10);
});

test('ignores invalid estimates and dates, sorts copies and never mutates input', () => {
  const source = Object.freeze([
    point(14, 110),
    point(1, 100),
    point(7, 0),
    point(8, NaN),
    { date: 'bad date', e1rmKilograms: 500 },
  ]);
  const points = strengthIndex([source], from, to);
  expect(points.at(-1)?.changePercent).toBeCloseTo(10);
  expect(source[0]?.e1rmKilograms).toBe(110);
  expect(strengthIndex([], from, to)).toEqual([]);
  expect(strengthIndex([[point(2, -1)]], from, to)).toEqual([]);
  expect(strengthIndex([source], to, from)).toEqual([]);
  expect(strengthIndex([source], from, from)).toEqual([]);
  expect(strengthIndex([source], new Date('invalid'), to)).toEqual([]);
});

test('starts at zero when every lift first appears mid-period', () => {
  const points = strengthIndex([[point(11, 50), point(21, 55)]], from, to);
  expect(points[0]).toMatchObject({ changePercent: 0, contributors: 0 });
  expect(points[2]).toMatchObject({ changePercent: 0, contributors: 1 });
  expect(points.at(-1)?.changePercent).toBeCloseTo(10);
});
