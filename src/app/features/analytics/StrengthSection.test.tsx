import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import { StrengthSection } from './StrengthSection';
import { StrengthExplanation } from './StrengthExplanation';

const state = vi.hoisted(() => ({ values: [false, false], cursor: 0 }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    return [
      state.values[index] ?? initial,
      (value: boolean) => {
        state.values[index] = value;
      },
    ];
  },
}));
const ranking = {
  lifts: [],
  medianChangePercent: 3.2,
  counts: { up: 14, flat: 5, down: 3 },
  points: [
    { date: '2024-01-01T00:00:00Z', changePercent: 0, contributors: 22 },
    { date: '2024-01-08T00:00:00Z', changePercent: 3.2, contributors: 22 },
    { date: '2024-01-15T00:00:00Z', changePercent: 3.2, contributors: 22 },
  ],
};
beforeEach(() => {
  state.values = [false, false];
  state.cursor = 0;
});

function infoClick(node: ReactNode): (() => void) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = infoClick(child);
      if (found !== undefined) return found;
    }
  }
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void; 'aria-label'?: string }>(node)) return undefined;
  return node.props['aria-label'] === 'About typical lift change' ? node.props.onClick : infoClick(node.props.children);
}

test('shows the typical lift, three accessible counts and a percent index with trend', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <StrengthSection ranking={ranking} weeks={12} />
    </MemoryRouter>,
  );
  expect(html).toContain('+3.2%');
  expect(html).toContain('Typical lift');
  expect(html).toContain('aria-label="14 lifts up"');
  expect(html).toContain('aria-label="5 lifts flat"');
  expect(html).toContain('aria-label="3 lifts down"');
  expect(html).toContain('Strength index');
  expect(html).toContain('Trend');
  expect(html).not.toContain('Median change across');
  expect(html).not.toContain('<dialog');
});

test('the info button opens the sheet with exactly three short explanations and can close it', () => {
  const props = { ranking: { ...ranking, points: [] }, weeks: 12 };
  infoClick(StrengthSection(props))?.();
  state.cursor = 0;
  const tree = StrengthSection(props);
  const html = renderToStaticMarkup(<MemoryRouter>{tree}</MemoryRouter>);
  expect(html).toContain('<dialog');
  expect(html).toContain('every lift counts equally');
  expect(html).toContain('at least two non-deload sessions');
  expect(html).toContain('flat within ±1%');
  if (isValidElement<{ children: ReactNode[] }>(tree)) {
    const sheet = tree.props.children.find((child) => isValidElement(child) && child.type === StrengthExplanation);
    if (isValidElement<{ onClose: () => void }>(sheet)) sheet.props.onClose();
  }
  state.cursor = 0;
  expect(renderToStaticMarkup(<MemoryRouter>{StrengthSection(props)}</MemoryRouter>)).not.toContain('<dialog');
});

test('empty strength has no invented percentage or chart', () => {
  const html = renderToStaticMarkup(
    <StrengthSection
      ranking={{
        lifts: [],
        medianChangePercent: null,
        counts: { up: 0, flat: 0, down: 0 },
        points: [],
      }}
      weeks={12}
    />,
  );
  expect(html).toContain('Not enough lift history');
  expect(html).not.toContain('Strength index');
  expect(html).not.toContain('0.0%');
});
