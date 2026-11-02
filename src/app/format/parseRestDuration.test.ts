import { describe, expect, test } from 'vitest';
import { parseRestDuration } from './parseRestDuration';

describe('parseRestDuration', () => {
  test.each([
    ['120', 120],
    ['90s', 90],
    ['90 sec', 90],
    ['3m', 180],
    ['3M', 180],
    ['2min', 120],
    ['1.5m', 90],
    ['2m30s', 150],
    ['2m 30s', 150],
    ['2:00', 120],
    ['1:30', 90],
    [' 45 ', 45],
  ])('reads %s as %s seconds', (text, seconds) => {
    expect(parseRestDuration(text)).toBe(seconds);
  });

  test('blank means not set', () => {
    expect(parseRestDuration('')).toBeNull();
    expect(parseRestDuration('   ')).toBeNull();
  });

  test.each(['abc', '2h', '1:75', 'm', 's', '2m3', '-30', '1,5m', '12:'])('refuses %s', (text) => {
    expect(parseRestDuration(text)).toBeNaN();
  });
});
