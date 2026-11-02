import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';
import { AnalyticsScreen } from './AnalyticsScreen';
import { SummaryTiles } from './SummaryTiles';
import { LiftTrendList } from './LiftTrendList';
vi.mock('../../data/database', () => ({ database: {}, useDatabaseQuery: () => ({ status: 'loading' }) }));
test('renders the Analytics views and reads period from the URL while loading', () => {
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/analytics?tab=muscles&period=4W'] },
      createElement(AnalyticsScreen),
    ),
  );
  expect(html).toContain('Analytics views');
  expect(html).toMatch(/aria-checked="true"[^>]*>Muscles/);
  expect(html).toMatch(/aria-pressed="true"[^>]*>4W/);
});
test('shows comparison and links lift to Charts', () => {
  const current = {
    workoutsPerWeek: 2,
    hardSetsPerWeek: 4,
    typicalSessionSeconds: 3600,
    averageRir: 2,
    rirNotLogged: 0,
    workouts: [],
  };
  const previous = { ...current, workoutsPerWeek: 1 };
  const tiles = renderToStaticMarkup(createElement(SummaryTiles, { current, previous, weeks: 12 }));
  expect(tiles).toContain('+100% vs previous 12 weeks');
  const lifts = [
    {
      id: 7,
      name: 'Bench',
      unit: 'kg' as const,
      sessions: 3,
      latest: 100,
      changePercent: 4.1,
      mixedMachines: false,
      points: [96, 98, 100],
      weeksSinceBest: 6,
    },
  ];
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(LiftTrendList, { lifts })));
  expect(html).toContain('/exercises/7?tab=charts');
  expect(html).toContain('+4.1%');
});
