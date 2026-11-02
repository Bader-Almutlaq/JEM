import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { NEW_TEMPLATE_DRAFT } from './templateExerciseEdits';
import { templatePath } from './templatePaths';
import { useTemplateEditor } from './useTemplateEditor';

const { navigate, saveTemplate } = vi.hoisted(() => ({
  navigate: vi.fn(),
  saveTemplate: vi.fn(() => Promise.resolve()),
}));
vi.mock('react-router', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/workout/templates/4', search: '' }),
}));
vi.mock('../../data/database', () => ({ database: { saveTemplate }, messageOf: String }));

function Save({
  planId,
  editing,
  capture,
}: {
  readonly planId: number | null;
  readonly editing: boolean;
  readonly capture: (save: () => void) => void;
}) {
  const initial = editing ? { ...NEW_TEMPLATE_DRAFT, id: 4 } : NEW_TEMPLATE_DRAFT;
  const model = useTemplateEditor(initial, planId);
  capture(model.save);
  return null;
}

test.each([
  [7, false, '/workout/plans/7'],
  [7, true, '/workout/plans/7'],
  [null, false, '/'],
] as const)('save returns to the originating plan or Workout', async (planId, editing, destination) => {
  navigate.mockClear();
  let save: () => void = () => {
    throw new Error('Save was not captured');
  };
  renderToStaticMarkup(
    createElement(Save, {
      planId,
      editing,
      capture: (action) => {
        save = action;
      },
    }),
  );
  save();
  await Promise.resolve();
  expect(navigate).toHaveBeenCalledWith(destination, { replace: true });
});

test('editing from a plan retains its origin in the editor URL', () => {
  expect(templatePath(4, 7)).toBe('/workout/templates/4?plan=7');
  expect(templatePath(4)).toBe('/workout/templates/4');
});

test('opening an exercise stashes the unsaved draft and returns to this editor with the restore flag', async () => {
  const { peekStashedTemplateDraft, clearStashedTemplateDraft } = await import('./templateDraftStash');
  navigate.mockClear();
  let open: (exerciseId: number) => void = () => {
    throw new Error('Not captured');
  };
  function Open({ capture }: { readonly capture: (open: (exerciseId: number) => void) => void }) {
    const model = useTemplateEditor({ ...NEW_TEMPLATE_DRAFT, id: 4, name: 'Saved name' }, null);
    capture(model.actions.openExercise);
    return null;
  }
  renderToStaticMarkup(
    createElement(Open, {
      capture: (captured) => {
        open = captured;
      },
    }),
  );
  open(12);
  expect(navigate).toHaveBeenCalledWith('/exercises/12', {
    state: { back: { to: '/workout/templates/4?restore=1', label: 'Edit workout' } },
  });
  expect(peekStashedTemplateDraft('4')?.name).toBe('Saved name');
  clearStashedTemplateDraft();
});
