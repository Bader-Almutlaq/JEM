import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { expect, test } from 'vitest';
import { WeeklySetsChart } from './WeeklySetsChart';
import { WeeklyEffortChart } from './WeeklyEffortChart';
import { MuscleDashboardTable } from './MuscleDashboardTable';
import { StrengthSection } from './StrengthSection';
import styles from './Analytics.module.css';

const points = [
  { date: '2024-01-01T12:00:00Z', value: 3, deload: false },
  { date: '2024-01-08T12:00:00Z', value: 5, deload: true },
];

test('weekly charts show dated axes, units, deload marks and a table', () => {
  for (const [chart, unit] of [
    [<WeeklySetsChart points={points} />, 'sets'],
    [<WeeklyEffortChart points={points} />, 'RIR'],
  ] as const) {
    const html = renderToStaticMarkup(chart);
    expect(html).toContain(unit);
    expect(html).toContain('Jan');
    expect(html).toContain('<table');
    expect(html).not.toContain('Show as table');
    expect(html).toContain('Deload');
  }
  expect(renderToStaticMarkup(<WeeklyEffortChart points={points} />)).not.toContain('Lower = harder');
});

test('muscle rows link to detail and group untrained muscles with signed colours', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <MuscleDashboardTable
        period="12W"
        muscles={[
          { muscle: 'chest', setsPerWeek: 5, strengthChangePercent: 2, averageRir: 2, shares: [] },
          { muscle: 'biceps', setsPerWeek: 0, strengthChangePercent: -1, averageRir: null, shares: [] },
        ]}
      />
    </MemoryRouter>,
  );
  expect(html).toContain('/analytics/muscles/chest?period=12W');
  expect(html).toContain(styles.rowLink);
  expect(html).toContain(styles.good);
  expect(html).toContain(styles.bad);
  expect(html.indexOf('Not trained in this period')).toBeLessThan(html.indexOf('Biceps'));
});

test('strength initially limits the list and colours the median', () => {
  const lifts = Array.from({ length: 9 }, (_, id) => ({
    id,
    name: `Lift ${id}`,
    unit: 'kg' as const,
    sessions: 3,
    latest: 100,
    changePercent: -2,
    mixedMachines: false,
    points: [100, 98],
    weeksSinceBest: 6,
  }));
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <StrengthSection
        ranking={{ lifts, medianChangePercent: -2, counts: { up: 0, flat: 0, down: 9 }, points: [] }}
        weeks={12}
      />
    </MemoryRouter>,
  );
  expect(html).toContain('Show all');
  expect(html).not.toContain('Lift 8');
  expect(html).toContain(styles.bad);
  expect(html).toContain('no new best in 6 wk');
});
