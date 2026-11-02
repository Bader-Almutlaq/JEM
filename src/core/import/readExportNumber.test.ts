import { describe, expect, test } from 'vitest';
import { readExportNumber } from './readExportNumber';

describe('readExportNumber', () => {
  test.each([
    ['61.23', 61.23],
    ['61,23', 61.23],
    ['0,125', 0.125],
    ['-12,5', -12.5],
    ['100', 100],
    ['.5', 0.5],
    ['1,234.5', 1234.5],
    ['1.234,5', 1234.5],
    ['12,345,678', 12_345_678],
    ['-1,234.5', -1234.5],
  ])('reads %s as %s', (text, expected) => {
    expect(readExportNumber(text)).toBe(expected);
  });

  test.each(['1,234', '999,999', '+1,000'])('refuses %s as ambiguous between thousands and decimals', (text) => {
    expect(readExportNumber(text)).toBeUndefined();
  });

  test.each(['', 'abc', 'NaN', 'Infinity', '0x10', '1,2,3', '1,23,456', '1.2.3', '1 000'])('refuses %s', (text) => {
    expect(readExportNumber(text)).toBeUndefined();
  });
});
