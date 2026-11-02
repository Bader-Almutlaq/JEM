import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { expect, test, vi } from 'vitest';
import { WorkoutPage } from './WorkoutPage';
import { WorkoutExercisePage } from './WorkoutExercisePage';

const state = vi.hoisted(() => ({
  active: null as number | null,
  missing: false,
  historyProps: vi.fn(),
  chartsProps: vi.fn(),
  redirect: vi.fn(),
  start: vi.fn(async () => undefined),
  startPress: vi.fn(),
}));
vi.mock('react-router', async (original) => {
  const router = await original<typeof import('react-router')>();
  return {
    ...router,
    Navigate: (props: { to: string }) => {
      state.redirect(props);
      return null;
    },
  };
});
vi.mock('../../data/database', () => ({
  database: {},
  useDatabaseQuery: (key: string) => {
    if (key.startsWith('workout-preview-'))
      return { status: 'ready', value: { entries: [], suggestedWarmupSetIds: [] } };
    if (key.startsWith('template-muscles-'))
      return { status: 'ready', value: { sets: 0, workouts: 1, exercises: 0, secondaryWeight: 0.5, muscles: [] } };
    if (key.startsWith('template-sessions-'))
      return { status: 'ready', value: { sessions: [], workouts: [], topExercise: null } };
    if (key.startsWith('template-exercises-')) return { status: 'ready', value: [] };
    if (key.startsWith('template-')) {
      if (key === 'template-list')
        return {
          status: 'ready',
          value: { folders: [], unfiled: [{ id: 4, name: 'Day', exerciseNames: [], lastStartedAt: null }] },
        };
      return {
        status: 'ready',
        value: state.missing ? null : { id: 4, name: 'Day', folderId: null, notes: null, exercises: [] },
      };
    }
    if (key === 'active-workout') return { status: 'ready', value: state.active };
    return { status: 'ready', value: { exercise: { id: 8, name: 'Press', tracking: 'weight-reps' } } };
  },
}));
vi.mock('./templateActions', async (original) => ({
  ...(await original<typeof import('./templateActions')>()),
  startTemplateWorkout: state.start,
}));
vi.mock('../../design/components/Button', () => ({
  Button: (props: { children: string; isDisabled?: boolean; onPress: () => void }) => {
    if (props.children === 'Start this workout') state.startPress(props.onPress);
    return createElement('button', { disabled: props.isDisabled, onClick: props.onPress }, props.children);
  },
}));
vi.mock('../workout/LoggingErrorBanner', () => ({ LoggingErrorBanner: () => null }));
vi.mock('../exercises/ExerciseHistoryTab', () => ({
  ExerciseHistoryTab: (props: unknown) => {
    state.historyProps(props);
    return null;
  },
}));
vi.mock('../exercises/ExerciseChartsTab', () => ({
  ExerciseChartsTab: (props: unknown) => {
    state.chartsProps(props);
    return null;
  },
}));

function page(path: string, exercise = false): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        Routes,
        {},
        createElement(Route, {
          path: exercise ? '/workout/workouts/:templateId/exercises/:exerciseId' : '/workout/workouts/:templateId',
          element: createElement(exercise ? WorkoutExercisePage : WorkoutPage),
        }),
      ),
    ),
  );
}

test('workout page reads tabs and disables start for an active workout', () => {
  state.missing = false;
  state.active = 12;
  const markup = page('/workout/workouts/4?tab=history');
  expect(markup).toContain('No sessions yet.');
  expect(markup).toContain('A workout is in progress');
  expect(markup).toMatch(/disabled=""[^>]*>Start this workout/);
  state.active = null;
  expect(page('/workout/workouts/4')).toContain('No exercises yet.');
});

test('unknown workout redirects', () => {
  state.missing = true;
  page('/workout/workouts/999');
  expect(state.redirect).toHaveBeenCalledWith(expect.objectContaining({ to: '/', replace: true }));
  state.missing = false;
});

test('exercise tabs receive the workout filter', () => {
  page('/workout/workouts/4/exercises/8?tab=history', true);
  expect(state.historyProps).toHaveBeenCalledWith(expect.objectContaining({ exerciseId: 8, templateId: 4 }));
  const markup = page('/workout/workouts/4/exercises/8', true);
  expect(markup).toContain('Progress');
  expect(state.chartsProps).toHaveBeenCalledWith(expect.objectContaining({ exerciseId: 8, templateId: 4 }));
});

test('start calls the existing template action', async () => {
  state.active = null;
  state.startPress.mockClear();
  page('/workout/workouts/4');
  const press: unknown = state.startPress.mock.calls[0]?.[0];
  expect(typeof press).toBe('function');
  if (typeof press === 'function') press();
  expect(state.start).toHaveBeenCalledWith(4);
});
