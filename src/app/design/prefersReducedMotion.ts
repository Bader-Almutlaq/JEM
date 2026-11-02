/** True when the owner asked the phone to reduce motion; also true outside a browser, where nothing should animate. */
export function prefersReducedMotion(): boolean {
  return typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
