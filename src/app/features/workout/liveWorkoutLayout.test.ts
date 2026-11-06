/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { TemplateSetDraft } from '../../../core/templates/TemplateDraft';
import type { LiveWorkoutEntry } from '../../../core/queries/LiveWorkout';
import type { ExerciseCardActions } from './ExerciseCardActions';
import { CheckButton } from './CheckButton';
import { ExerciseCard } from './ExerciseCard';
import { ExerciseInfoLine } from './ExerciseInfoLine';
import { SetRow } from './SetRow';
import { SetColumnHeader } from './SetColumnHeader';
import { SET_KIND_CHOICES, SET_KIND_NAMES } from './setKindItems';
import { exerciseMenuItems } from './exerciseMenuItems';
import { ValueCell } from './ValueCell';
import { makeExercise, makeSet } from './workoutTestData';

vi.mock('../../data/database', () => ({
  database: {},
  useDatabaseQuery: () => ({ status: 'ready', value: [1] }),
}));

const actions: ExerciseCardActions = {
  edit: vi.fn(),
  toggleCompleted: vi.fn(),
  selectKind: vi.fn(),
  deleteSet: vi.fn(),
  addSet: vi.fn(),
  switchUnit: vi.fn(),
  move: vi.fn(),
  requestRemoval: vi.fn(),
};
const entry: LiveWorkoutEntry = {
  entry: { id: 1, workoutId: 1, exerciseId: 1, position: 0, notes: null, supersetGroup: null },
  exercise: makeExercise(),
  sets: [makeSet()],
  previous: [makeSet()],
};

function row(options: Partial<Parameters<typeof SetRow>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(SetRow, {
      entry,
      set: entry.sets[0] ?? makeSet(),
      label: '1',
      previous: entry.previous[0],
      editing: undefined,
      actions,
      ...options,
    }),
  );
}

test('live headers have five columns; History keeps a separate RPE column', () => {
  const header = (isPastWorkout: boolean) =>
    renderToStaticMarkup(createElement(SetColumnHeader, { tracking: 'weight-reps', unit: 'kg', isPastWorkout }));
  expect(header(false)).toContain('>Previous<');
  expect(header(false)).not.toContain('>RPE<');
  expect(header(true)).toContain('>RPE<');
});

test('empty RPE badges are hidden until requested, while entered effort is always visible', () => {
  const render = (rpe: number | null) =>
    renderToStaticMarkup(
      createElement(CheckButton, {
        isCompleted: false,
        onPress: vi.fn(),
        onEditRpe: vi.fn(),
        rpe,
      }),
    );
  expect(render(null)).not.toContain('aria-label="Set RPE"');
  expect(render(7.5)).toContain('aria-label="Edit RPE 7.5"');
  expect(row({ set: makeSet({ rpe: 7.5 }) })).not.toContain('aria-label="RPE"');
});

test('planned live cells are greyed until typed/accepted; completed cells and history are ordinary values', () => {
  expect(row()).toMatch(/data-placeholder="true"[^>]*aria-label="Weight"/);
  expect(row({ actions: { ...actions, isValueEntered: () => true } })).toMatch(
    /data-placeholder="false"[^>]*aria-label="Weight"/,
  );
  expect(row({ set: makeSet({ isCompleted: true }) })).toMatch(/data-placeholder="false"[^>]*aria-label="Weight"/);
  expect(row({ isPastWorkout: true })).toMatch(/data-placeholder="false"[^>]*aria-label="Weight"/);
});

test('the opt-in suggestion stays beside the current value and copies only when its button is tapped', () => {
  const accept = vi.fn();
  const cell = ValueCell({
    name: 'Weight',
    text: '41',
    isPlaceholder: true,
    isEditing: false,
    onPress: vi.fn(),
    suggestion: { value: 43.5, text: '43.5', onAccept: accept },
  });
  const html = renderToStaticMarkup(cell);
  expect(html).toContain('>41</span>');
  expect(html).toContain('Use suggested weight 43.5');
  expect(accept).not.toHaveBeenCalled();
  const suggestionButton: unknown = cell.props.children[1];
  if (!isValidElement<{ onClick: () => void }>(suggestionButton)) throw new Error('Missing suggestion button');
  suggestionButton.props.onClick();
  expect(accept).toHaveBeenCalledWith(43.5);
});

test('warm-up suggestions use set entry units, disappear when accepted, and do not appear in history', () => {
  const warmup = makeSet({ kind: 'warmup', entryUnit: 'lb', weightKilograms: 20.41165665 });
  const options = { set: warmup, isSuggested: true, actions: { ...actions, applySuggestion: vi.fn() } };
  // The untouched value already is the suggestion, so it shows once, in amber, without a second copy.
  expect(row(options)).toMatch(/data-suggested="true" aria-label="Weight"><span[^>]*>45</);
  expect(row(options)).not.toContain('Use suggested');
  expect(row({ ...options, actions: { ...options.actions, isValueEntered: () => true } })).not.toContain(
    'data-suggested="true"',
  );
  expect(row({ ...options, isPastWorkout: true })).not.toContain('data-suggested="true"');
});

test('warm-up surface uses theme classes; failure uses the bad-status token', () => {
  expect(row({ set: makeSet({ kind: 'warmup' }), label: 'W' })).toContain('data-kind="warmup"');
  expect(row({ set: makeSet({ kind: 'failure' }), label: 'F' })).toContain('data-kind="failure">F');
  expect(SET_KIND_CHOICES.map((kind) => SET_KIND_NAMES[kind])).toEqual(['Warm-up', 'Normal', 'Drop', 'Failure']);
});

test('info line omits absent metadata and preserves existing note lines', () => {
  expect(renderToStaticMarkup(createElement(ExerciseInfoLine, { entry }))).toBe('');
  const html = renderToStaticMarkup(
    createElement(ExerciseInfoLine, {
      entry: {
        ...entry,
        exercise: makeExercise({ restTargetSeconds: 135 }),
        entry: { ...entry.entry, notes: 'Line one\nLine two' },
      },
    }),
  );
  expect(html).toContain('Rest 2:15');
  expect(html).toContain('Line one\nLine two');
});

test('Owner decision: the live menu has no notes, targets, rest time or warm-up toggle; those belong to editing the workout', () => {
  const live = {};
  const capable = { ...actions, saveNotes: vi.fn(), setRestTarget: vi.fn() };
  const menu = exerciseMenuItems({ entry, index: 0, count: 1, actions: capable, unit: 'kg', live });
  expect(menu.map((item) => item.label)).toEqual([
    'Add warm-up set',
    'Unit: kg → lb',
    'Move up',
    'Move down',
    'Remove exercise',
  ]);
  menu.find((item) => item.label.startsWith('Unit:'))?.onSelect();
  expect(capable.switchUnit).toHaveBeenCalledWith(1, 'lb');
  expect(menu.find((item) => item.label === 'Move up')?.isDisabled).toBe(true);
  const minimal = exerciseMenuItems({ entry, index: 0, count: 1, actions, unit: 'kg' });
  expect(minimal.map((item) => item.label)).toEqual(['Move up', 'Move down', 'Remove exercise']);
});

test('shared history card retains notes, separate RPE entry, mixed-unit labelling and disabled completion', () => {
  const html = renderToStaticMarkup(
    createElement(ExerciseCard, {
      entry: {
        ...entry,
        sets: [makeSet({ isCompleted: true, rpe: 7.5, entryUnit: 'lb' }), makeSet({ id: 2, isCompleted: true })],
      },
      index: 0,
      count: 1,
      actions,
      editing: undefined,
      notes: { exercise: vi.fn(), set: vi.fn() },
    }),
  );
  expect(html).toContain('>RPE</span>');
  expect(html).toContain('aria-label="RPE"');
  expect(html).toContain('Add exercise notes');
  expect(html).toMatch(/aria-label="Completed"[^>]*disabled=""/);
  expect(html).toContain('>kg</span>');
  expect(html).not.toContain('Use suggested');
});

test('planned working targets show range, single reps and effort independently of progression', () => {
  const target: TemplateSetDraft = { kind: 'working', targetRepsLow: 6, targetRepsHigh: 8, targetRpe: null };
  const render = (changes: Partial<TemplateSetDraft>, restTargetSeconds: number | null = null) =>
    renderToStaticMarkup(
      createElement(ExerciseInfoLine, {
        entry: { ...entry, exercise: makeExercise({ restTargetSeconds }), plannedTargets: [{ ...target, ...changes }] },
      }),
    );
  expect(render({}, 120)).toContain('6–8 reps</span><span');
  expect(render({}, 120)).toContain('Rest 2:00');
  expect(render({ targetRepsLow: 8 })).toContain('8 reps');
  expect(render({ targetRpe: 8 })).toContain('RPE 8');
  const ranged = renderToStaticMarkup(
    createElement(ExerciseInfoLine, {
      entry: {
        ...entry,
        exercise: makeExercise({ restTargetSeconds: 120, restMaxSeconds: 180 }),
        plannedTargets: [{ ...target, targetRpe: 8, targetRpeHigh: 9 }],
      },
    }),
  );
  expect(ranged).toContain('RPE 8–9');
  expect(ranged).toContain('Rest 2:00–3:00');
  expect(ranged).not.toContain(' · ');
  expect(render({ targetRepsLow: null, targetRepsHigh: null })).toBe('');
});

test('the exercise note is plain text while logging (edited with the saved workout) and absent when blank', () => {
  const html = renderToStaticMarkup(
    createElement(ExerciseInfoLine, { entry: { ...entry, entry: { ...entry.entry, notes: 'Keep steady' } } }),
  );
  expect(html).toContain('Keep steady');
  expect(html).not.toContain('<button');
  expect(renderToStaticMarkup(createElement(ExerciseInfoLine, { entry }))).toBe('');
});

test('large weights remain present in the compact value cell', () => {
  expect(row({ set: makeSet({ weightKilograms: 1000.5 }) })).toContain('1,000.5');
});

test('bodyweight heading describes added load and warm-ups are added through the menu', () => {
  expect(renderToStaticMarkup(createElement(SetColumnHeader, { tracking: 'bodyweight-reps', unit: 'kg' }))).toContain(
    'Added kg',
  );
  const addSet = vi.fn();
  const menu = exerciseMenuItems({
    entry,
    index: 0,
    count: 1,
    actions: { ...actions, addSet },
    unit: 'kg',
    live: {},
  });
  menu.find((item) => item.label === 'Add warm-up set')?.onSelect();
  expect(addSet).toHaveBeenCalledWith(1, 'warmup');
  expect(menu.map((item) => item.label)).not.toContain('Show RPE');
});

test('visible value boxes keep rounded corners and a 44px hit area', () => {
  const css = readFileSync(new URL('./ValueCell.module.css', import.meta.url), 'utf8');
  expect(css).toContain('height: var(--workout-box-height)');
  expect(css).toContain('border-radius: var(--radius-small)');
  expect(css).toContain('inset: -8px 0');
  expect(css).not.toContain('solid transparent');
  expect(css).not.toContain('background-clip: padding-box');
});
