import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { LiveWorkoutEntry } from '../../../core/queries/LiveWorkout';
import { ActionMenuRow } from '../../design/components/ActionMenuRow';
import { DeloadChip } from './DeloadChip';
import { DeloadSheet } from './DeloadSheet';
import { ExerciseInfoLine } from './ExerciseInfoLine';
import { exerciseMenuItems } from './exerciseMenuItems';
import type { ExerciseCardActions } from './ExerciseCardActions';
import { WorkoutMenu } from './WorkoutMenu';
import { SetRow } from './SetRow';
import { makeExercise, makeSet } from './workoutTestData';

const previous = makeSet({ weightKilograms: 100 });
const entry: LiveWorkoutEntry = {
  entry: {
    id: 1,
    workoutId: 1,
    exerciseId: 1,
    position: 0,
    notes: null,
    supersetGroup: null,
    deloadStage: 1,
    deloadLoadPercent: 20,
  },
  exercise: makeExercise(),
  sets: [previous],
  previous: [previous],
  deload: {
    reductionPercent: 20,
    suggestions: [{ setId: previous.id, weightKilograms: 80, reps: previous.reps, reductionPercent: 20 }],
  },
};
const actions: ExerciseCardActions = {
  edit: vi.fn(),
  toggleCompleted: vi.fn(),
  selectKind: vi.fn(),
  deleteSet: vi.fn(),
  addSet: vi.fn(),
  switchUnit: vi.fn(),
  move: vi.fn(),
  requestRemoval: vi.fn(),
  setDeload: vi.fn(),
  applySuggestion: vi.fn(),
};

test('exercise menu exposes the yellow deload action and forwards stage enable only on selection', () => {
  const open = vi.fn();
  const items = exerciseMenuItems({
    entry,
    index: 0,
    count: 1,
    actions,
    unit: 'kg',
    live: { editDeload: open },
  });
  const action = items.find((item) => item.label === 'Deload…');
  if (action === undefined) throw new Error('Missing deload action');
  expect(renderToStaticMarkup(createElement(ActionMenuRow, { item: action, onChosen: vi.fn() }))).toContain(
    'data-deload="true"',
  );
  expect(actions.setDeload).not.toHaveBeenCalled();
  action.onSelect();
  expect(open).toHaveBeenCalledOnce();
});

test('whole-workout menu renders its action', () => {
  const html = renderToStaticMarkup(
    createElement(WorkoutMenu, { onRename: vi.fn(), onDiscard: vi.fn(), onDeload: vi.fn() }),
  );
  expect(html).toContain('Workout options');
});

test('info line shows a tappable reduction and History uses a tag', () => {
  const html = renderToStaticMarkup(createElement(ExerciseInfoLine, { entry, onDeload: vi.fn() }));
  expect(html).toContain('Deload · −20%');
  expect(html).toContain('<button');
  expect(renderToStaticMarkup(createElement(DeloadChip, { entry }))).toContain('Deload · −20%');
});

test('deload occupies amber beside unchanged grey values, and entered/completed/history cells hide suggestions', () => {
  const render = (options: Partial<Parameters<typeof SetRow>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(SetRow, {
        entry,
        set: previous,
        label: '1',
        previous,
        editing: undefined,
        actions,
        ...options,
      }),
    );
  expect(render()).toContain('Use suggested weight 80');
  expect(render()).toContain('>100</span>');
  expect(render({ actions: { ...actions, isValueEntered: () => true } })).not.toContain('Use suggested');
  expect(render({ set: { ...previous, isCompleted: true } })).not.toContain('Use suggested');
  expect(render({ isPastWorkout: true })).not.toContain('Use suggested');
});

test('sheet shows defaults and active actions', () => {
  const html = renderToStaticMarkup(
    createElement(DeloadSheet, { entry, onClose: vi.fn(), onSave: vi.fn(), onEnd: vi.fn() }),
  );
  expect(html).toContain('Lighter session. Next time builds back halfway.');
  expect(html).toContain('−20%');
  expect(html).toContain('Save');
  expect(html).toContain('End deload');
  expect(html).not.toContain('Keep 1 of');
});

test('sets label describes the saved reduction', () => {
  const setsEntry = { ...entry, entry: { ...entry.entry, deloadMode: 'sets' as const, deloadSetPercent: 50 } };
  expect(renderToStaticMarkup(createElement(DeloadChip, { entry: setsEntry }))).toContain('Deload · 1 of 2 sets');
});

test('sets mode shows the kept count and hides the weight stepper', () => {
  const setsEntry = { ...entry, entry: { ...entry.entry, deloadMode: 'sets' as const, deloadSetPercent: 50 } };
  const html = renderToStaticMarkup(
    createElement(DeloadSheet, { entry: setsEntry, onClose: vi.fn(), onSave: vi.fn() }),
  );
  expect(html).toContain('Keep 1 of 2 sets');
  expect(html).toContain('Next time is a normal session.');
  expect(html).not.toContain('Decrease weight reduction');
});
