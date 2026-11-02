import { TABS } from '../design/components/TabBar';

/** How a screen change animates: slide in from the right, slide in from the left, or crossfade. */
export type RouteTransitionKind = 'forward' | 'back' | 'fade';

/** Removes the deployment base (such as `/workout-tracker/`) so tab roots compare as app paths. */
function appPath(pathname: string, basename: string): string {
  const base = basename.endsWith('/') ? basename.slice(0, -1) : basename;
  if (base !== '' && pathname.startsWith(base)) return pathname.slice(base.length) || '/';
  return pathname;
}

/**
 * Chooses the animation for a move between two paths, or null when the screen does not change (a query or
 * hash edit, or a link to the current screen). Going back always slides back; arriving at a tab's root
 * crossfades, since tabs are siblings rather than a stack; anything else pushes forward.
 */
export function routeTransitionKind(
  from: string,
  to: string,
  isBack: boolean,
  basename: string,
): RouteTransitionKind | null {
  if (from === to) return null;
  if (isBack) return 'back';
  const destination = appPath(to, basename);
  return TABS.some((tab) => tab.path === destination) ? 'fade' : 'forward';
}
