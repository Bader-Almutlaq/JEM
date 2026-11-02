import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { TemplateExerciseHeader } from './TemplateExerciseHeader';
import type { TemplateEditorActions } from './TemplateEditorActions';

const actions: TemplateEditorActions = {
  setRepRange: vi.fn(),
  setExerciseNotes: vi.fn(),
  setMachineBrand: vi.fn(),
  setProgression: vi.fn(),
  edit: vi.fn(),
  addSet: vi.fn(),
  removeSet: vi.fn(),
  cycleKind: vi.fn(),
  move: vi.fn(),
  toggleSuperset: vi.fn(),
  removeExercise: vi.fn(),
};

test('exercise menu offers Add note and opens its editor', () => {
  const onNote = vi.fn();
  const onProgression = vi.fn();
  const header = TemplateExerciseHeader({
    name: 'Press',
    index: 0,
    count: 1,
    isInSuperset: false,
    isSupersetWithNext: false,
    actions,
    onNote,
    onRepRange: vi.fn(),
    onProgression,
    hasNote: false,
  });
  const menu: unknown = header.props.children[2];
  if (!isValidElement<{ items: readonly { label: string; onSelect: () => void }[] }>(menu))
    throw new Error('Missing menu');
  expect(menu.props.items[0]?.label).toBe('Targets…');
  expect(menu.props.items[1]?.label).toBe('Progression…');
  menu.props.items[1]?.onSelect();
  expect(onProgression).toHaveBeenCalledOnce();
  expect(menu.props.items[2]?.label).toBe('Add note');
  menu.props.items[2]?.onSelect();
  expect(onNote).toHaveBeenCalledOnce();
  expect(
    renderToStaticMarkup(
      createElement(TemplateExerciseHeader, {
        name: 'Press',
        index: 0,
        count: 1,
        isInSuperset: false,
        isSupersetWithNext: false,
        actions,
        onNote,
        onRepRange: vi.fn(),
        hasNote: true,
      }),
    ),
  ).toContain('Press');
});

vi.mock('../../data/database', () => ({
  database: {},
  useDatabaseQuery: (key: string) =>
    key.startsWith('template-previous-')
      ? { status: 'ready', value: [{ kind: 'working', weightKilograms: 140, entryUnit: 'kg', reps: 3, rpe: 9 }] }
      : {
          status: 'ready',
          value: { exercise: { restTargetSeconds: 120, tracking: 'weight-reps', defaultEntryUnit: 'kg' } },
        },
}));

test('template exercise shows saved rest and an editable note without a blank note when absent', async () => {
  const { TemplateExerciseCard } = await import('./TemplateExerciseCard');
  const exercise = { exerciseId: 1, supersetGroup: null, notes: 'Keep steady', sets: [] };
  const props = {
    exercise,
    name: 'Press',
    index: 0,
    count: 1,
    isTimed: false,
    isSupersetWithNext: false,
    editing: undefined,
    actions,
  };
  const html = renderToStaticMarkup(createElement(TemplateExerciseCard, props));
  expect(html).toContain('Rest 2:00');
  expect(html).not.toContain('>Progression</button>');
  expect(html).toContain('>Keep steady</button>');
  const empty = renderToStaticMarkup(
    createElement(TemplateExerciseCard, { ...props, exercise: { ...exercise, notes: null } }),
  );
  expect(empty).not.toContain('Keep steady');
  const enabled = renderToStaticMarkup(
    createElement(TemplateExerciseCard, { ...props, exercise: { ...exercise, progression: 'double' } }),
  );
  expect(enabled).toContain('Reps first');
});

test('editor shows previous performance alongside target fields', async () => {
  const { TemplateExerciseCard } = await import('./TemplateExerciseCard');
  const html = renderToStaticMarkup(
    createElement(TemplateExerciseCard, {
      exercise: {
        exerciseId: 1,
        supersetGroup: null,
        notes: null,
        sets: [{ kind: 'working', targetRepsLow: 6, targetRepsHigh: 10, targetRpe: null }],
      },
      name: 'Press',
      index: 0,
      count: 1,
      isTimed: false,
      isSupersetWithNext: false,
      editing: undefined,
      actions,
    }),
  );
  expect(html).toContain('Previous');
  expect(html).toContain('140 kg × 3 @ 9');
});
