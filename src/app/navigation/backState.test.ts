import { expect, test } from 'vitest';
import { backState, backTarget } from './backState';

const fallback = { to: '/exercises', label: 'Exercises' };

test('a link from Analytics returns to Analytics with its query', () => {
  const state = backState({ pathname: '/analytics', search: '?period=12W' }, 'Analytics');
  expect(backTarget(state, fallback)).toEqual({ to: '/analytics?period=12W', label: 'Analytics' });
});

test('missing or malformed state falls back', () => {
  expect(backTarget(null, fallback)).toBe(fallback);
  expect(backTarget({ back: { to: 3, label: 'x' } }, fallback)).toBe(fallback);
  expect(backTarget({ other: true }, fallback)).toBe(fallback);
});
