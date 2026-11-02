import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import { AnalyticsScreen } from './AnalyticsScreen';
import { analyticsTab, type AnalyticsTab } from './analyticsTabs';
import { SegmentedControl } from '../../design/components/SegmentedControl';
import { PeriodChips } from './PeriodChips';
import type { AnalyticsPeriod } from './analyticsPeriod';

const state = vi.hoisted(() => {
  const effects: (() => void)[] = [];
  return {
    search: '',
    pins: 0,
    status: 'ready',
    update: vi.fn(),
    effects,
  };
});
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effect: () => void) => state.effects.push(effect),
}));
vi.mock('react-router', () => ({
  useSearchParams: () => [
    new URLSearchParams(state.search),
    (next: URLSearchParams, options?: { replace?: boolean }) => {
      state.search = next.toString();
      state.update(next, options);
    },
  ],
}));
vi.mock('../../data/database', () => ({
  database: {},
  useDatabaseQuery: (key: string) =>
    state.status === 'ready'
      ? {
          status: 'ready',
          value: key === 'first-finished-workout' ? null : Array.from({ length: state.pins }),
        }
      : { status: state.status, message: 'Read failed' },
}));
vi.mock('./AnalyticsDashboard', () => ({ AnalyticsDashboard: () => <p>Overview content</p> }));
vi.mock('./MusclesAnalytics', () => ({ MusclesAnalytics: () => <p>Muscles content</p> }));
vi.mock('./EffortAnalytics', () => ({ EffortAnalytics: () => <p>Effort content</p> }));
vi.mock('./PinnedLifts', () => ({ PinnedLifts: () => <p>Pinned content</p> }));
vi.mock('./ActivePlanRow', () => ({ ActivePlanRow: () => <p>Active plan content</p> }));

beforeEach(() => {
  state.search = '';
  state.pins = 0;
  state.status = 'ready';
  state.update.mockClear();
  state.effects = [];
});

function findChange<Value extends string>(node: ReactNode, type: unknown): ((value: Value) => void) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findChange<Value>(child, type);
      if (found !== undefined) return found;
    }
  }
  if (!isValidElement<{ onChange?: (value: Value) => void; children?: ReactNode }>(node)) return undefined;
  return node.type === type ? node.props.onChange : findChange<Value>(node.props.children, type);
}

test('defaults to Pinned with pins and Overview without, including unknown URL values', () => {
  expect(analyticsTab(null, false)).toBe('overview');
  expect(analyticsTab('unknown', true)).toBe('pinned');
  let html = renderToStaticMarkup(<AnalyticsScreen />);
  expect(html).toContain('Overview content');
  expect(html).not.toContain('Pinned content');
  state.pins = 1;
  html = renderToStaticMarkup(<AnalyticsScreen />);
  expect(html).toContain('Pinned content');
  expect(html).toContain('Active plan content');
  expect(html).not.toContain('Overview content');
});

test('each explicit URL tab renders only its view and has exactly one set of period chips', () => {
  state.pins = 1;
  for (const [tab, label] of [
    ['pinned', 'Pinned'],
    ['overview', 'Overview'],
    ['muscles', 'Muscles'],
    ['effort', 'Effort'],
  ]) {
    state.search = `tab=${tab}&period=4W`;
    const html = renderToStaticMarkup(<AnalyticsScreen />);
    expect(html).toContain(`${label} content`);
    expect(html).toMatch(new RegExp(`aria-checked="true"[^>]*>${label}`));
    expect(html.match(/>4W<\/button>/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>4W/);
    for (const other of ['Pinned', 'Overview', 'Muscles', 'Effort'].filter((item) => item !== label)) {
      expect(html).not.toContain(`${other} content`);
    }
  }
});

test('switching tabs and periods preserves the other URL choices for return navigation', () => {
  state.search = 'tab=overview&period=4W&keep=yes';
  findChange<AnalyticsTab>(AnalyticsScreen(), SegmentedControl)?.('muscles');
  expect(new URLSearchParams(state.search).get('tab')).toBe('muscles');
  expect(new URLSearchParams(state.search).get('period')).toBe('4W');
  expect(renderToStaticMarkup(<AnalyticsScreen />)).toContain('Muscles content');
  findChange<AnalyticsPeriod>(AnalyticsScreen(), PeriodChips)?.('6M');
  expect(new URLSearchParams(state.search).get('tab')).toBe('muscles');
  expect(new URLSearchParams(state.search).get('period')).toBe('6M');
  expect(new URLSearchParams(state.search).get('keep')).toBe('yes');
  expect(state.update).toHaveBeenCalledTimes(2);
});

test('shows loading and failure without rendering tab queries', () => {
  state.status = 'loading';
  expect(renderToStaticMarkup(<AnalyticsScreen />)).toContain('Loading…');
  state.status = 'failed';
  const html = renderToStaticMarkup(<AnalyticsScreen />);
  expect(html).toContain('Read failed');
  expect(html).not.toContain('Overview content');
});

test('persists the pin-aware default using replace and keeps Pinned after the last unpin', () => {
  state.pins = 1;
  AnalyticsScreen();
  state.effects.at(-1)?.();
  expect(new URLSearchParams(state.search).get('tab')).toBe('pinned');
  expect(state.update).toHaveBeenLastCalledWith(expect.any(URLSearchParams), { replace: true });
  state.pins = 0;
  expect(renderToStaticMarkup(<AnalyticsScreen />)).toContain('Pinned content');
});
