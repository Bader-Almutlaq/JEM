import { useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import {
  UNSAFE_createBrowserHistory as createBrowserHistory,
  unstable_HistoryRouter as HistoryRouter,
} from 'react-router';
import { prefersReducedMotion } from '../design/prefersReducedMotion';
import { backTransitionRequest } from './backTransitionRequest';
import { withRouteTransitions } from './withRouteTransitions';

/**
 * The app's browser router: behaves like React Router's `BrowserRouter`, and moves between screens with a
 * short same-document view transition where the browser supports it (docs/DESIGN.md → Motion). Router state
 * updates are not wrapped in React transitions, so each navigation commits inside the view transition.
 */
export function ViewTransitionRouter({
  basename,
  children,
}: {
  readonly basename: string;
  readonly children: ReactNode;
}) {
  const [history] = useState(() =>
    withRouteTransitions(createBrowserHistory({ window, v5Compat: true }), {
      root: document.documentElement,
      startViewTransition: 'startViewTransition' in document ? (update) => document.startViewTransition(update) : null,
      isMotionReduced: prefersReducedMotion,
      commit: flushSync,
      consumeBackRequest: () => backTransitionRequest.consume(),
      basename,
    }),
  );
  return (
    <HistoryRouter basename={basename} history={history} useTransitions={false}>
      {children}
    </HistoryRouter>
  );
}
