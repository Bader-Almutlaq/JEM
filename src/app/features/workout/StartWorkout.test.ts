import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';
import { StartWorkout } from './StartWorkout';

vi.mock('../../design/drag/WorkoutDrag', () => ({ WorkoutDrag: ({ children }: { children: ReactNode }) => children }));
vi.mock('../templates/templateActions', () => ({ startTemplateWorkout: vi.fn() }));
vi.mock('./workoutActions', () => ({ startEmptyWorkout: vi.fn() }));
vi.mock('../templates/TemplatesSection', () => ({ TemplatesSection: () => createElement('div', {}, 'Plans') }));
vi.mock('./LoggingErrorBanner', () => ({ LoggingErrorBanner: () => null }));
vi.mock('./RestoreDataCard', () => ({ RestoreDataCard: () => createElement('div', {}, 'Restore card') }));

test('workout tab shows plans and the history link without a past workouts section', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(StartWorkout)));
  expect(html).toContain('Plans');
  expect(html).toContain('href="/history"');
  expect(html).not.toContain('Past workouts');
});

test('the restore card is offered only while no workout is in progress', () => {
  const idle = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(StartWorkout)));
  const busy = renderToStaticMarkup(
    createElement(MemoryRouter, {}, createElement(StartWorkout, { hasActiveWorkout: true })),
  );
  expect(idle).toContain('Restore card');
  expect(busy).not.toContain('Restore card');
  expect(busy).toContain('A workout is in progress');
});
