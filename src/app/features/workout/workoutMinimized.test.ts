import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test } from 'vitest';
import { minimizeWorkout, resumeWorkout, useWorkoutMinimized } from './workoutMinimized';

afterEach(() => resumeWorkout());

test('minimizing and resuming are what the hook reports', () => {
  const seen: boolean[] = [];
  function Probe() {
    seen.push(useWorkoutMinimized());
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  minimizeWorkout();
  renderToStaticMarkup(createElement(Probe));
  resumeWorkout();
  renderToStaticMarkup(createElement(Probe));
  expect(seen).toEqual([false, true, false]);
});
