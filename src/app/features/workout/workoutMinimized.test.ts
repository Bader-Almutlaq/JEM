import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test } from 'vitest';
import { minimizeWorkout, resumeWorkout, useWorkoutMinimized } from './workoutMinimized';

afterEach(() => resumeWorkout());

function minimizedFor(workoutId: number | undefined): boolean {
  let seen = false;
  function Probe() {
    seen = useWorkoutMinimized(workoutId);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return seen;
}

test('minimizing and resuming are what the hook reports', () => {
  expect(minimizedFor(1)).toBe(false);
  minimizeWorkout(1);
  expect(minimizedFor(1)).toBe(true);
  resumeWorkout();
  expect(minimizedFor(1)).toBe(false);
});

test('a minimized workout never carries over to the next one, and no workout is never minimized', () => {
  minimizeWorkout(1);
  expect(minimizedFor(2)).toBe(false);
  expect(minimizedFor(undefined)).toBe(false);
});
