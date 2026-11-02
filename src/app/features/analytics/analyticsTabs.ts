/** The four URL-addressable Analytics views. */
export type AnalyticsTab = 'pinned' | 'overview' | 'muscles' | 'effort';

/** Analytics navigation order, shared by URL resolution and the segmented control. */
export const analyticsTabs: readonly { readonly value: AnalyticsTab; readonly label: string }[] = Object.freeze([
  { value: 'pinned', label: 'Pinned' },
  { value: 'overview', label: 'Overview' },
  { value: 'muscles', label: 'Muscles' },
  { value: 'effort', label: 'Effort' },
]);

/** A valid URL selection, otherwise the pin-aware default. */
export function analyticsTab(value: string | null, hasPins: boolean): AnalyticsTab {
  return analyticsTabs.find((tab) => tab.value === value)?.value ?? (hasPins ? 'pinned' : 'overview');
}
