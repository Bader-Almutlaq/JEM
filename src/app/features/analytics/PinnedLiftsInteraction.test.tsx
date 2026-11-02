import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';
import { PinnedLifts } from './PinnedLifts';

const state = vi.hoisted(() => ({ pinned: [] as number[], navigation: vi.fn() }));
vi.mock('../../data/database', () => ({
  messageOf: String,
  database: {
    pinExercise: async (id: number) => {
      state.pinned.push(id);
    },
  },
  useDatabaseQuery: () => ({
    status: 'ready',
    value: {
      cards: state.pinned.map((id) => ({
        pin: { exerciseId: id },
        detail: { exercise: { name: id === 1 ? 'Bench' : 'Squat', defaultEntryUnit: 'kg' } },
        strength: { latest: null, trend: [] },
      })),
      suggestions: [
        { id: 1, name: 'Bench' },
        { id: 2, name: 'Squat' },
      ],
      ranking: { lifts: [] },
    },
  }),
}));
vi.mock('react-router', async (original) => ({
  ...(await original<typeof import('react-router')>()),
  useNavigate: () => state.navigation,
  useLocation: () => ({ pathname: '/analytics', search: '', state: null }),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => [initial, vi.fn()],
}));

function findButton(node: ReactNode, label: string): (() => void) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child, label);
      if (found !== undefined) return found;
    }
  }
  if (isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) {
    if (node.type === 'button' && Array.isArray(node.props.children) && node.props.children.join('') === label)
      return node.props.onClick;
    return findButton(node.props.children, label);
  }
  return undefined;
}

test('two consecutive suggestion taps keep both cards in database order without navigation', async () => {
  state.pinned = [];
  state.navigation.mockClear();
  let tree = PinnedLifts({ from: 'a', to: 'b' });
  const first = findButton(tree, '+ Bench');
  expect(first).toBeDefined();
  first?.();
  await Promise.resolve();
  tree = PinnedLifts({ from: 'a', to: 'b' });
  expect(findButton(tree, '+ Bench')).toBeUndefined();
  const second = findButton(tree, '+ Squat');
  expect(second).toBeDefined();
  second?.();
  await Promise.resolve();
  tree = PinnedLifts({ from: 'a', to: 'b' });
  const html = renderToStaticMarkup(<MemoryRouter>{tree}</MemoryRouter>);
  expect(state.pinned).toEqual([1, 2]);
  expect(html.indexOf('>Bench</a>')).toBeLessThan(html.indexOf('>Squat</a>'));
  expect(html).not.toContain('+ Squat');
  expect(state.navigation).not.toHaveBeenCalled();
});
