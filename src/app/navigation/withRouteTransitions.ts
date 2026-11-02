import { NavigationType, UNSAFE_createBrowserHistory as createBrowserHistory } from 'react-router';
import { routeTransitionKind, type RouteTransitionKind } from './routeTransitionKind';

/** The browser history React Router uses; the router does not export the type by name. */
export type RouterHistory = ReturnType<typeof createBrowserHistory>;

/** The browser services route transitions need, injectable so the logic is testable without a browser. */
export interface RouteTransitionEnvironment {
  /** The element that carries `data-route-transition` while a transition runs (the root element). */
  readonly root: { readonly dataset: DOMStringMap };
  /** `document.startViewTransition`, or null where the browser lacks it (animation is then skipped). */
  readonly startViewTransition: ((update: () => void) => { readonly finished: Promise<unknown> }) | null;
  /** True when the owner asked for reduced motion. */
  readonly isMotionReduced: () => boolean;
  /** Runs work and commits the resulting render synchronously (`flushSync`). */
  readonly commit: (work: () => void) => void;
  /** Returns whether a back link marked the current navigation, and clears the mark. */
  readonly consumeBackRequest: () => boolean;
  /** The deployment base path, e.g. `/workout-tracker/`. */
  readonly basename: string;
}

/**
 * Wraps a router history so screen changes run inside a same-document view transition. The route change
 * and its render happen inside the transition's update callback, so the browser can snapshot the old screen
 * first; that makes `navigate()` apply one frame later when animated. Replace navigations, same-path
 * changes, reduced motion and browsers without view transitions pass straight through unchanged.
 */
export function withRouteTransitions(history: RouterHistory, environment: RouteTransitionEnvironment): RouterHistory {
  let currentPath = history.location.pathname;
  let latestTransition = 0;

  function animate(kind: RouteTransitionKind, update: () => void): void {
    const { startViewTransition, root } = environment;
    if (startViewTransition === null || environment.isMotionReduced()) {
      update();
      return;
    }
    const id = ++latestTransition;
    root.dataset['routeTransition'] = kind;
    const clear = () => {
      if (id === latestTransition) delete root.dataset['routeTransition'];
    };
    startViewTransition(() => environment.commit(update)).finished.then(clear, clear);
  }

  return {
    get action() {
      return history.action;
    },
    get location() {
      return history.location;
    },
    createHref: (to) => history.createHref(to),
    createURL: (to) => history.createURL(to),
    encodeLocation: (to) => history.encodeLocation(to),
    replace: (to, state) => history.replace(to, state),
    go: (delta) => history.go(delta),
    push(to, state) {
      const isBack = environment.consumeBackRequest();
      const kind = routeTransitionKind(currentPath, history.createURL(to).pathname, isBack, environment.basename);
      if (kind === null) history.push(to, state);
      else animate(kind, () => history.push(to, state));
    },
    listen(listener) {
      return history.listen((update) => {
        const from = currentPath;
        currentPath = update.location.pathname;
        if (update.action !== NavigationType.Pop) {
          listener(update);
          return;
        }
        const kind = routeTransitionKind(from, currentPath, true, environment.basename);
        if (kind === null) listener(update);
        else animate(kind, () => listener(update));
      });
    },
  };
}
