import { expect, test } from 'vitest';
import { routeTransitionKind } from './routeTransitionKind';

test('a push to a deeper screen slides forward, and a way back slides back', () => {
  expect(routeTransitionKind('/exercises', '/exercises/4', false, '/')).toBe('forward');
  expect(routeTransitionKind('/exercises/4', '/exercises', true, '/')).toBe('back');
});

test('arriving at a tab root crossfades, with or without a deployment base', () => {
  expect(routeTransitionKind('/exercises', '/analytics', false, '/')).toBe('fade');
  expect(routeTransitionKind('/workout-tracker/exercises', '/workout-tracker/', false, '/workout-tracker/')).toBe(
    'fade',
  );
  expect(routeTransitionKind('/workout-tracker/', '/workout-tracker/history', false, '/workout-tracker/')).toBe(
    'forward',
  );
});

test('staying on the same path does not animate', () => {
  expect(routeTransitionKind('/analytics', '/analytics', false, '/')).toBeNull();
  expect(routeTransitionKind('/analytics', '/analytics', true, '/')).toBeNull();
});
