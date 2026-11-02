import { expect, test } from 'vitest';
import { isSwipeDown } from './swipeDown';

test('a long, mostly vertical drag down is a swipe', () => {
  expect(isSwipeDown(5, 80)).toBe(true);
  expect(isSwipeDown(-20, 60)).toBe(true);
});

test('short, upward or sideways drags are not', () => {
  expect(isSwipeDown(0, 20)).toBe(false);
  expect(isSwipeDown(0, -90)).toBe(false);
  expect(isSwipeDown(90, 80)).toBe(false);
});
