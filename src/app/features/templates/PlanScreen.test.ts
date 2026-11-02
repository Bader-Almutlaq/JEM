import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import type { TemplateList } from '../../../core/queries/TemplateCatalog';
import { PlanScreen } from './PlanScreen';
import { TemplateGroups } from './TemplateGroups';
import { TemplateSectionActions } from './TemplateSectionActions';
import { makeTemplateListActions } from './makeTemplateListActions';

const redirect = vi.hoisted(() => vi.fn());
vi.mock('react-router', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router')>();
  return {
    ...original,
    Navigate: (props: { to: string; replace?: boolean }) => {
      redirect(props);
      return null;
    },
  };
});
vi.mock('../../data/database', () => ({
  database: {},
  useDatabaseQuery: (key: string) => ({
    status: 'ready',
    value: key.startsWith('plan-summary-')
      ? { sets: 3, workouts: 1, exercises: 1, secondaryWeight: 0.5, muscles: [] }
      : key === 'active-plan'
        ? 7
        : fixture(),
  }),
}));
vi.mock('../workout/LoggingErrorBanner', () => ({ LoggingErrorBanner: () => null }));

function fixture(): TemplateList {
  const workout = {
    id: 4,
    name: 'Synthetic day',
    folderId: 7,
    weekday: 3,
    position: 0,
    notes: null,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    lastStartedAt: '2024-01-01T12:00:00Z',
    exerciseNames: ['Synthetic exercise'],
    setCount: 3,
  };
  return {
    folders: [
      { id: 7, name: 'Synthetic plan', position: 0, lastStartedAt: workout.lastStartedAt, templates: [workout] },
    ],
    unfiled: [{ ...workout, id: 5, folderId: null, name: 'Standalone workout' }],
  };
}

function route(path: string): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        Routes,
        {},
        createElement(Route, { path: '/workout/plans/:folderId', element: createElement(PlanScreen) }),
      ),
    ),
  );
}

beforeEach(() => redirect.mockClear());

test('plan cards link to a page, report count and last use, and keep unfiled workouts under Other workouts', () => {
  const list = fixture();
  const markup = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {},
      createElement(TemplateGroups, {
        list,
        now: new Date('2024-01-03T12:00:00Z'),
        actions: makeTemplateListActions(list, () => undefined),
      }),
    ),
  );
  expect(markup).toContain('href="/workout/plans/7"');
  expect(markup).toContain('1 workout');
  expect(markup).toContain('Active');
  expect(markup).toContain('Today: Synthetic day');
  expect(markup).toContain('href="/workout/workouts/4"');
  expect(markup).toContain('Last: 2 days ago');
  expect(markup).toContain('Other workouts');
  expect(markup).toContain('Standalone workout');
  expect(markup).not.toMatch(/Template|Folder/);
});

test('plan route shows its name, three sections and Workout back link; new workout is scoped to the plan', () => {
  const markup = route('/workout/plans/7');
  expect(markup).toContain('Synthetic plan');
  expect(markup).toContain('Synthetic day');
  expect(markup).toContain('Synthetic exercise');
  expect(markup).toMatch(/class="[^"]*dayTag[^"]*">Wed<\/span>/);
  expect(markup).toContain('Last done');
  for (const label of ['Workouts', 'History', 'Analytics', '+ Workout']) expect(markup).toContain(`>${label}<`);
  expect(markup).toContain('href="/"');
  expect(markup).not.toContain('aria-label="Settings"');
  expect(markup).toContain('/workout/templates/new?plan=7');
  expect(redirect).not.toHaveBeenCalled();
});

test.each(['999', 'invalid', '7.0'])('unknown or malformed plan %s redirects to Workout with replacement', (id) => {
  expect(route(`/workout/plans/${id}`)).toBe('');
  expect(redirect).toHaveBeenCalledWith({ to: '/', replace: true });
});

test('creation buttons use Workout and Plan wording', () => {
  const markup = renderToStaticMarkup(
    createElement(MemoryRouter, {}, createElement(TemplateSectionActions, { onNewFolder: () => undefined })),
  );
  expect(markup).toContain('New workout');
  expect(markup).toContain('New plan');
  expect(markup).not.toContain('>New template<');
  expect(markup).not.toContain('>New folder<');
});

test('summary deep link renders the saved plan totals', () => {
  const markup = route('/workout/plans/7?tab=summary');
  expect(markup).toContain('sets per week');
  expect(markup).toContain('Sets per muscle');
});

test('active plan is displayed before other plans without changing their saved order', () => {
  const list = fixture();
  const first = { id: 8, name: 'Other plan', position: 0, lastStartedAt: null, templates: [] };
  const reordered = { ...list, folders: [first, ...list.folders] };
  const markup = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {},
      createElement(TemplateGroups, {
        list: reordered,
        now: new Date('2024-01-03T12:00:00Z'),
        actions: makeTemplateListActions(reordered, () => undefined),
      }),
    ),
  );
  expect(markup.indexOf('Synthetic plan')).toBeLessThan(markup.indexOf('Other plan'));
  expect(reordered.folders[0]?.name).toBe('Other plan');
});
