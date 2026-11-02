import { MemoryRouter } from 'react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { LiveWorkoutEntry } from '../../../core/queries/LiveWorkout';
import { makeExercise, makeSet } from '../workout/workoutTestData';
import { WorkoutPreviewCard } from './WorkoutPreviewCard';
import { WorkoutPreview } from './WorkoutPreview';

const state = vi.hoisted(() => ({
  status: 'ready',
  message: 'Preview could not be loaded.',
  entries: [] as readonly LiveWorkoutEntry[],
}));
vi.mock('../../data/database', () => ({
  database: {},
  useDatabaseQuery: () => ({ ...state, value: { entries: state.entries, suggestedWarmupSetIds: [] } }),
}));

function entry(): LiveWorkoutEntry {
  const sets = [
    makeSet({ id: -1, kind: 'warmup', weightKilograms: 400 }),
    makeSet({ id: -2, position: 1, weightKilograms: 1000, reps: 10 }),
    makeSet({ id: -3, position: 2, kind: 'drop', weightKilograms: 900 }),
  ];
  return {
    entry: {
      id: -1,
      workoutId: 0,
      exerciseId: 1,
      position: 0,
      notes: 'Keep the pause',
      machineBrand: 'Technogym',
      supersetGroup: null,
    },
    exercise: makeExercise({
      name: 'Triceps Pushdown (Cable - Straight Bar)',
      restTargetSeconds: 120,
      restMaxSeconds: 180,
    }),
    sets,
    previous: sets.map((set) => ({ ...set, isCompleted: true, rpe: 9 })),
    plannedTargets: [{ kind: 'working', targetRepsLow: 8, targetRepsHigh: 10, targetRpe: 8, targetRpeHigh: 9 }],
    progression: {
      targets: [],
      suggestions: [
        {
          setId: -2,
          weightKilograms: 1002.5,
          previousWeightKilograms: 1000,
          reps: 8,
          targetRepsLow: 8,
          targetRepsHigh: 10,
          reason: 'add-load',
        },
      ],
    },
  };
}

test('Owner decision: preview reuses live rows with previous effort, four-digit values and targets, shows no progression suggestions, and has no controls', () => {
  const markup = renderToStaticMarkup(<WorkoutPreviewCard entry={entry()} suggestedWarmupSetIds={[-1]} />);
  expect(markup).toContain('Triceps Pushdown (Cable - Straight Bar)');
  expect(markup).toContain('8–10 reps');
  expect(markup).toContain('RPE 8–9');
  expect(markup).toContain('Rest 2:00–3:00');
  expect(markup).toContain('Technogym');
  expect(markup).toContain('Keep the pause');
  expect(markup).toContain('1,000 kg × 10 @ 9');
  expect(markup).toContain('data-placeholder="true"');
  expect(markup).toContain('>1,000</span>');
  expect(markup).not.toContain('1,002.5');
  expect(markup).not.toContain('Suggested');
  expect(markup).toContain('data-kind="drop"');
  expect(markup).toContain('data-kind="warmup"');
  expect(markup).not.toMatch(/<button|<input|<textarea/);
  expect(markup).not.toContain('Add set');
  expect(markup).not.toContain('Exercise options');
  expect(markup).not.toContain('Delete set');
  expect(markup).not.toContain('<svg');
});

test('timed preview rows use Time and omit the weight column', () => {
  const source = entry();
  const markup = renderToStaticMarkup(
    <WorkoutPreviewCard
      entry={{
        ...source,
        exercise: makeExercise({ tracking: 'duration' }),
        sets: [makeSet({ durationSeconds: 90 })],
        previous: [],
      }}
      suggestedWarmupSetIds={[]}
    />,
  );
  expect(markup).toContain('>Time</span>');
  expect(markup).not.toContain('>kg</span>');
  expect(markup).not.toContain('<button');
});

test('preview query surfaces loading, failure and empty states without logging controls', () => {
  state.status = 'loading';
  expect(
    renderToStaticMarkup(
      <MemoryRouter>
        <WorkoutPreview templateId={4} />
      </MemoryRouter>,
    ),
  ).toContain('Loading…');
  state.status = 'failed';
  expect(
    renderToStaticMarkup(
      <MemoryRouter>
        <WorkoutPreview templateId={4} />
      </MemoryRouter>,
    ),
  ).toContain(state.message);
  state.status = 'ready';
  expect(
    renderToStaticMarkup(
      <MemoryRouter>
        <WorkoutPreview templateId={4} />
      </MemoryRouter>,
    ),
  ).toContain('No exercises yet.');
  state.entries = [entry()];
  const markup = renderToStaticMarkup(
    <MemoryRouter>
      <WorkoutPreview templateId={4} />
    </MemoryRouter>,
  );
  expect(markup).toContain('1,000');
  expect(markup).toContain('href="/workout/workouts/4/exercises/1"');
  expect(markup).not.toContain('<button');
  state.entries = [];
});
