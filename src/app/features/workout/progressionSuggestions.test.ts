import { progressionText } from './progressionText';
import { ExerciseCardHeader } from './ExerciseCardHeader';
import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { LiveWorkoutEntry } from '../../../core/queries/LiveWorkout';
import type { ProgressionSuggestion } from '../../../core/logging/ProgressionPlan';
import { toKilograms } from '../../../core/units/Weight';
import type { ExerciseCardActions } from './ExerciseCardActions';
import { makeExercise, makeSet } from './workoutTestData';
import { SetRow } from './SetRow';
import { ExerciseInfoLine } from './ExerciseInfoLine';
import { progressionValueSuggestion } from './progressionValueSuggestion';
import { ValueCell } from './ValueCell';

const suggestion: ProgressionSuggestion = {
  weightKilograms: 102.5,
  previousWeightKilograms: 100,
  reps: 8,
  targetRepsLow: 8,
  targetRepsHigh: 12,
  reason: 'add-load',
};
const baseline = makeSet({ weightKilograms: 100, reps: 12 });
const entry: LiveWorkoutEntry = {
  entry: { id: 1, workoutId: 1, exerciseId: 1, position: 0, notes: null, supersetGroup: null },
  exercise: makeExercise(),
  sets: [baseline],
  previous: [baseline],
  progression: {
    targets: [{ kind: 'working', targetRepsLow: 8, targetRepsHigh: 12, targetRpe: 8 }],
    suggestions: [{ ...suggestion, setId: baseline.id }],
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
  applySuggestion: vi.fn(),
};
function row(options: Partial<Parameters<typeof SetRow>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(SetRow, {
      entry,
      set: baseline,
      label: '1',
      previous: baseline,
      editing: undefined,
      actions,
      ...options,
    }),
  );
}
function info(source: LiveWorkoutEntry) {
  return renderToStaticMarkup(createElement(ExerciseInfoLine, { entry: source }));
}

test('enabled progression shows separate amber and grey values; off, warm-ups, completed and History do not', () => {
  expect(row()).toContain('Use suggested weight 102.5');
  expect(row()).toContain('Use suggested reps 8');
  expect(row()).toMatch(/data-placeholder="true"[^>]*aria-label="Weight"/);
  const { progression: ignored, ...off } = entry;
  void ignored;
  expect(row({ entry: off })).not.toContain('Use suggested');
  expect(row({ set: makeSet({ id: 2, kind: 'warmup' }) })).not.toContain('Use suggested');
  expect(row({ set: { ...baseline, isCompleted: true } })).not.toContain('Use suggested');
  expect(row({ isPastWorkout: true })).not.toContain('Use suggested');
});

test('tapping amber passes the suggested value only; rendering never accepts it', () => {
  const accept = vi.fn();
  const option = progressionValueSuggestion(suggestion, baseline, baseline, 'weight', accept);
  if (option === undefined) throw new Error('Missing suggestion');
  const cell = ValueCell({
    name: 'Weight',
    text: '100',
    isPlaceholder: true,
    isEditing: false,
    onPress: vi.fn(),
    suggestion: option,
  });
  const html = renderToStaticMarkup(cell);
  expect(html).toContain('>100</span>');
  expect(html).toContain('Use suggested weight 102.5');
  expect(accept).not.toHaveBeenCalled();
  const button: unknown = cell.props.children[1];
  if (!isValidElement<{ onClick: () => void }>(button)) throw new Error('Missing amber button');
  button.props.onClick();
  expect(accept).toHaveBeenCalledExactlyOnceWith(102.5);
  expect(baseline.weightKilograms).toBe(100);
});

test('unchanged repeat values still have a separate tappable amber button', () => {
  const accept = vi.fn();
  const repeat = { ...suggestion, weightKilograms: 100, reps: 12 };
  const option = progressionValueSuggestion(repeat, baseline, baseline, 'reps', accept);
  if (option === undefined) throw new Error('Missing suggestion');
  const cell = ValueCell({
    name: 'Reps',
    text: '12',
    isPlaceholder: true,
    isEditing: false,
    onPress: vi.fn(),
    suggestion: option,
  });
  expect(renderToStaticMarkup(cell)).toContain('Use suggested reps 12');
  const button: unknown = cell.props.children[1];
  if (!isValidElement<{ onClick: () => void }>(button)) throw new Error('Missing amber button');
  button.props.onClick();
  expect(accept).toHaveBeenCalledWith(12);
});

test('accepted/typed cells hide suggestions independently, including after reload when values differ', () => {
  expect(row({ actions: { ...actions, isValueEntered: (_id, field) => field === 'weight' } })).not.toContain(
    'Use suggested weight',
  );
  expect(row({ actions: { ...actions, isValueEntered: (_id, field) => field === 'weight' } })).toContain(
    'Use suggested reps',
  );
  expect(row({ set: { ...baseline, weightKilograms: 102.5 } })).not.toContain('Use suggested weight');
  expect(row({ set: { ...baseline, reps: 8 } })).not.toContain('Use suggested reps');
});

test('mode tag belongs only in exercise options, never in the info row', () => {
  expect(progressionText(entry)).toBe('+reps first');
  const weightEntry: LiveWorkoutEntry = {
    ...entry,
    progression: { ...entry.progression, targets: [], suggestions: [], mode: 'weight-first' },
  };
  expect(progressionText(weightEntry)).toBe('+kg first');
  expect(info(weightEntry)).not.toContain('first');
  expect(info(entry)).not.toContain('next');
  const header = ExerciseCardHeader({
    entry: weightEntry,
    index: 0,
    count: 1,
    actions,
    live: {},
  });
  const menu: unknown = header.props.children[2];
  if (!isValidElement<{ caption: string }>(menu)) throw new Error('Missing options');
  expect(menu.props.caption).toBe('+kg first');
});

test('load-only suggestions do not expose a reps button', () => {
  expect(
    progressionValueSuggestion({ ...suggestion, suggestReps: false }, baseline, baseline, 'reps', vi.fn()),
  ).toBeUndefined();
});

test('lb cells and load reasons use the set entry unit; bodyweight supplies no weight suggestion', () => {
  const pounds = makeSet({ ...baseline, weightKilograms: toKilograms(100, 'lb'), entryUnit: 'lb' });
  const poundSuggestion = {
    ...suggestion,
    weightKilograms: toKilograms(105, 'lb'),
    previousWeightKilograms: pounds.weightKilograms,
  };
  const lbEntry = {
    ...entry,
    sets: [pounds],
    previous: [pounds],
    progression: {
      targets: entry.progression?.targets ?? [],
      suggestions: [{ ...poundSuggestion, setId: 1 }],
    },
  };
  expect(row({ entry: lbEntry, set: pounds, previous: pounds })).toContain('Use suggested weight 105');
  expect(info(lbEntry)).not.toContain('next');
  const bodyweight = {
    ...entry,
    exercise: makeExercise({ tracking: 'bodyweight-reps' }),
    progression: {
      targets: entry.progression?.targets ?? [],
      suggestions: [{ ...suggestion, weightKilograms: null, setId: 1 }],
    },
  };
  expect(row({ entry: bodyweight })).not.toContain('Use suggested weight');
  expect(row({ entry: bodyweight })).toContain('Use suggested reps');
});

test('acceptance keeps exact kg even when a kg override displays as fractional pounds', () => {
  const pounds = makeSet({ ...baseline, entryUnit: 'lb' });
  const exact = 101.23456789;
  const option = progressionValueSuggestion(
    { ...suggestion, weightKilograms: exact },
    pounds,
    baseline,
    'weight',
    vi.fn(),
  );
  if (option === undefined) throw new Error('Missing suggestion');
  expect(toKilograms(option.value, 'lb')).toBeCloseTo(exact, 12);
  expect(option.text).not.toBe(String(option.value));
});
