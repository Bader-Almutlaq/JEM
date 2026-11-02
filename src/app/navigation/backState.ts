/** Where a pushed screen's back link returns to, carried in router state by the screen that opened it. */
export interface BackTarget {
  readonly to: string;
  readonly label: string;
}

/** Router state for a link that should return to the current screen, e.g. Analytics → an exercise → back to Analytics. */
export function backState(location: { readonly pathname: string; readonly search: string }, label: string) {
  return { back: { to: `${location.pathname}${location.search}`, label } };
}

/** The back target in router state, or the fallback when the screen was opened directly or from its own tab. */
export function backTarget(state: unknown, fallback: BackTarget): BackTarget {
  if (typeof state !== 'object' || state === null || !('back' in state)) return fallback;
  const back: unknown = state.back;
  if (typeof back !== 'object' || back === null || !('to' in back) || !('label' in back)) return fallback;
  return typeof back.to === 'string' && typeof back.label === 'string' ? { to: back.to, label: back.label } : fallback;
}
