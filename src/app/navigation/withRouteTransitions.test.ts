import { describe, expect, test, vi } from 'vitest';
import { withRouteTransitions, type RouteTransitionEnvironment, type RouterHistory } from './withRouteTransitions';

function fakeHistory(path = '/exercises') {
  let listener: ((update: { action: string; location: { pathname: string } }) => void) | null = null;
  const pushed: string[] = [];
  const replaced: string[] = [];
  const history = {
    action: 'POP',
    location: { pathname: path },
    createHref: String,
    createURL: (to: string) => new URL(to, 'https://example.test'),
    encodeLocation: String,
    push: (to: string) => {
      pushed.push(to);
      listener?.({ action: 'PUSH', location: { pathname: to } });
    },
    replace: (to: string) => {
      replaced.push(to);
    },
    go: () => undefined,
    listen: (next: typeof listener) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
  };
  return {
    pop: (to: string) => listener?.({ action: 'POP', location: { pathname: to } }),
    pushed,
    replaced,
    // The fake covers exactly the members the wrapper uses.
    history: history as unknown as RouterHistory,
  };
}

function environment(overrides: Partial<RouteTransitionEnvironment> = {}) {
  const root = { dataset: {} as DOMStringMap };
  const started: (() => void)[] = [];
  const finish: (() => void)[] = [];
  const base: RouteTransitionEnvironment = {
    root,
    startViewTransition: (update) => {
      started.push(update);
      return {
        finished: new Promise<void>((resolve) => {
          finish.push(resolve);
        }),
      };
    },
    isMotionReduced: () => false,
    commit: (work) => work(),
    consumeBackRequest: () => false,
    basename: '/',
    ...overrides,
  };
  return { base, root, started, finish };
}

describe('withRouteTransitions', () => {
  test('defers a push into a view transition and tags the root with its kind until it finishes', async () => {
    const { history, pushed } = fakeHistory();
    const { base, root, started, finish } = environment();
    const wrapped = withRouteTransitions(history, base);
    const listener = vi.fn();
    wrapped.listen(listener);
    wrapped.push('/exercises/4');
    expect(pushed).toEqual([]);
    expect(root.dataset['routeTransition']).toBe('forward');
    started[0]?.();
    expect(pushed).toEqual(['/exercises/4']);
    expect(listener).toHaveBeenCalledOnce();
    finish[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.dataset['routeTransition']).toBeUndefined();
  });

  test('a marked back navigation slides back', () => {
    const { history } = fakeHistory('/exercises/4');
    const { base, root } = environment({ consumeBackRequest: () => true });
    withRouteTransitions(history, base).push('/exercises');
    expect(root.dataset['routeTransition']).toBe('back');
  });

  test('reduced motion, missing support, replace and same-path pushes act immediately', () => {
    for (const overrides of [{ isMotionReduced: () => true }, { startViewTransition: null }]) {
      const { history, pushed } = fakeHistory();
      withRouteTransitions(history, environment(overrides).base).push('/analytics');
      expect(pushed).toEqual(['/analytics']);
    }
    const { history, pushed, replaced } = fakeHistory();
    const { base, started } = environment();
    const wrapped = withRouteTransitions(history, base);
    wrapped.replace('/analytics');
    wrapped.push('/exercises');
    expect(replaced).toEqual(['/analytics']);
    expect(pushed).toEqual(['/exercises']);
    expect(started).toHaveLength(0);
  });

  test('a pop to another screen animates back, and the listener runs inside the transition', () => {
    const fake = fakeHistory('/exercises/4');
    const { base, root, started } = environment();
    const listener = vi.fn();
    withRouteTransitions(fake.history, base).listen(listener);
    fake.pop('/exercises');
    expect(listener).not.toHaveBeenCalled();
    expect(root.dataset['routeTransition']).toBe('back');
    started[0]?.();
    expect(listener).toHaveBeenCalledOnce();
  });
});
