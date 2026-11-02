import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { TimeChart } from './TimeChart';
import { TimeChartExpanded } from './TimeChartExpanded';
import { TimeChartCallout } from './TimeChartCallout';
import { TimeChartTable } from './TimeChartTable';
import { timeChartModel } from './timeChartModel';
import type { TimeChartProps } from './TimeChart.types';
import { chartHistoryDomain } from './timeChartMath';
import { ChartTable } from './ChartTable';
import { TablePill } from './TablePill';
import styles from './TimeChart.module.css';
import pillStyles from './TablePill.module.css';
import { readFileSync } from 'node:fs';

const props: TimeChartProps = {
  title: 'Estimated 1RM',
  unit: 'kg',
  aggregation: 'max',
  formatValue: (value) => `${value} kg`,
  series: [
    {
      name: 'Press',
      points: [
        { date: '2026-01-01T12:00:00Z', value: 100, sessionId: 1 },
        { date: '2026-01-02T12:00:00Z', value: 110, sessionId: 2 },
        { date: '2026-01-03T12:00:00Z', value: 120, sessionId: 3 },
      ],
    },
  ],
};
const history = chartHistoryDomain(props.series);
if (history === null) throw new Error('Missing fixture history');

test('compact chart has one short heading, icon-only accessible expand, units, dates and hidden data table', () => {
  const html = renderToStaticMarkup(createElement(TimeChart, props));
  expect(html).toContain('aria-label="Expand Estimated 1RM"');
  expect(html).toMatch(/aria-label="Expand Estimated 1RM"[^>]*><svg/);
  expect(html.match(/<h2/g)).toHaveLength(1);
  expect(html).toContain('kg</text>');
  expect(html).toContain('Jan');
  expect(html).toContain(`class="${styles.hidden}"`);
  expect(html).toContain('<table');
  for (const caption of ['Touch and drag', 'Tap to expand', 'Each point', 'Show as table', 'Latest week', 'takeaway'])
    expect(html).not.toContain(caption);
  expect(html).not.toMatch(/<p(?:\s|>)/);
});

test('legend is absent for one series, named for multiple series, and dashed for a drawable trend', () => {
  expect(renderToStaticMarkup(createElement(TimeChart, props))).not.toContain('Series legend');
  expect(
    renderToStaticMarkup(
      createElement(TimeChart, {
        ...props,
        series: [...props.series, { name: 'Other', points: props.series[0]?.points ?? [] }],
      }),
    ),
  ).toContain('Series legend');
  const trend = renderToStaticMarkup(createElement(TimeChart, { ...props, trend: true }));
  expect(trend).toContain('>Trend<');
  expect(trend).toContain('data-trend');
});

test('regression requires three valid non-deload points, including in mixed buckets', () => {
  for (const points of [
    props.series[0]?.points.slice(0, 2) ?? [],
    (props.series[0]?.points ?? []).map((point, index) => ({ ...point, deload: index === 0 })),
  ]) {
    expect(
      renderToStaticMarkup(createElement(TimeChart, { ...props, trend: true, series: [{ name: 'Press', points }] })),
    ).not.toContain('data-trend');
  }
});

test('null observations split the line and deload markers have the yellow class', () => {
  const points = props.series[0]?.points ?? [];
  const html = renderToStaticMarkup(
    createElement(TimeChart, {
      ...props,
      series: [
        {
          name: 'Press',
          points: points.map((point, index) => ({
            ...point,
            value: index === 1 ? null : point.value,
            deload: index === 2,
          })),
        },
      ],
    }),
  );
  expect(html.match(new RegExp(`class="${styles.line}"`, 'g'))).toHaveLength(2);
  expect(html).toContain(styles.deload);
  expect(html).toContain('aria-label="Deload"');
  expect(html).not.toContain('NaN');
});

test('sum charts draw bars, levels draw lines, and empty or single values stay finite', () => {
  const bars = renderToStaticMarkup(createElement(TimeChart, { ...props, kind: 'bars', aggregation: 'sum' }));
  expect(bars).toContain(styles.bar);
  expect(bars).not.toContain(`class="${styles.line}"`);
  for (const points of [[], props.series[0]?.points.slice(0, 1) ?? []]) {
    const html = renderToStaticMarkup(createElement(TimeChart, { ...props, series: [{ name: 'Press', points }] }));
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain('Expand Estimated 1RM');
  }
});

test('expanded view has close and Table controls without range chips or rotation instructions', () => {
  const html = renderToStaticMarkup(createElement(TimeChartExpanded, { props, history, onClose: () => undefined }));
  expect(html).toContain('Close chart');
  expect(html).toContain('>Table<');
  for (const text of ['>3M<', '>6M<', '>1Y<', '>All<', 'Tap to expand']) expect(html).not.toContain(text);
});

test('callout shows date, units, named series, Deload and an expanded Open control', () => {
  const chart = {
    ...props,
    series: [{ name: 'Press', points: [{ date: '2026-01-02T12:00:00Z', value: 90, deload: true, sessionId: 1 }] }],
    onOpenPoint: () => undefined,
  };
  const domain = { from: Date.parse('2026-01-01'), to: Date.parse('2026-01-03') };
  const model = timeChartModel(chart, domain, 430, 160, true);
  const date = model.dates[0] ?? '';
  const html = renderToStaticMarkup(
    createElement(TimeChartCallout, { model, date, props: chart, width: 430, openable: true }),
  );
  expect(html).toContain('90 kg');
  expect(html).toContain('Deload');
  expect(html).toContain('Open Press session');
  expect(
    renderToStaticMarkup(createElement(TimeChartCallout, { model, date, props: chart, width: 430, openable: false })),
  ).not.toContain('<button');
});

test('expanded table exposes bucket values and links every source session, including aggregate buckets', () => {
  const chart = { ...props, onOpenPoint: () => undefined };
  const domain = { from: Date.parse('2025-01-01'), to: Date.parse('2026-11-01') };
  const model = timeChartModel(chart, domain, 800, 260, true);
  const html = renderToStaticMarkup(
    createElement(TimeChartTable, { model, props: chart, visible: true, expanded: true }),
  );
  expect(html).toContain('Open session 1');
  expect(html).toContain('Open session 2');
  expect(html).toContain('Open session 3');
  expect(html).not.toContain(styles.hidden);
});

test('callout is the accent bubble: filled with the callout token and high-contrast text', () => {
  const chart = { ...props };
  const domain = { from: Date.parse('2026-01-01'), to: Date.parse('2026-01-03') };
  const model = timeChartModel(chart, domain, 430, 160, false);
  const html = renderToStaticMarkup(
    createElement(TimeChartCallout, { model, date: model.dates[0] ?? '', props: chart, width: 430, openable: false }),
  );
  expect(html).toContain(`class="${styles.callout}"`);
  expect(html).toContain(styles.calloutPeriod);
  expect(html).toContain(styles.calloutAmount);
  const css = readFileSync(new URL('./TimeChart.module.css', import.meta.url), 'utf8');
  const callout = /\.callout \{[^}]*\}/.exec(css)?.[0] ?? '';
  expect(callout).toContain('background: var(--color-callout)');
  expect(callout).toContain('color: var(--color-on-callout)');
  expect(callout).toContain('var(--radius-medium)');
  expect(css).toMatch(/\.rule \{[^}]*var\(--color-callout\)/);
  expect(css).toMatch(/\.ring \{[^}]*var\(--color-callout\)/);
});

test('the table toggle is a small pill named Show table / Hide table', () => {
  const closed = renderToStaticMarkup(createElement(TablePill, { shown: false, onToggle: () => undefined }));
  expect(closed).toContain(`class="${pillStyles.pill}"`);
  expect(closed).toContain('aria-label="Show table"');
  expect(closed).toContain('aria-expanded="false"');
  expect(closed).toContain('>Table<');
  const open = renderToStaticMarkup(createElement(TablePill, { shown: true, onToggle: () => undefined }));
  expect(open).toContain('aria-label="Hide table"');
  const css = readFileSync(new URL('./TablePill.module.css', import.meta.url), 'utf8');
  expect(css).toContain('min-height: 28px');
  expect(css).toContain('var(--font-caption)');
  expect(css).toContain('var(--radius-small)');
  expect(css).toContain('inset: -8px');
});

test('distribution tables use the pill instead of a full-width "Show as table" text button', () => {
  const html = renderToStaticMarkup(
    createElement(ChartTable, {
      caption: 'Sets',
      columns: ['Range', 'Sets'],
      rows: [{ key: 'a', cells: ['1-5', '3'] }],
    }),
  );
  expect(html).toContain('aria-label="Show table"');
  expect(html).not.toContain('Show as table');
});

test('the plot has no left gutter and value labels sit inside it over the marks', () => {
  const model = timeChartModel(
    props,
    { from: Date.parse('2026-01-01'), to: Date.parse('2026-01-03') },
    398,
    160,
    false,
  );
  expect(model.scales.left).toBe(0);
  const html = renderToStaticMarkup(createElement(TimeChart, props));
  expect(html.lastIndexOf('<circle')).toBeLessThan(html.indexOf('kg</text>'));
});
