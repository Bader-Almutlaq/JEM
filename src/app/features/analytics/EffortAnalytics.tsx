import { database, useDatabaseQuery } from '../../data/database';
import { EmptyState } from '../../design/components/EmptyState';
import { EffortAndReps } from './EffortAndReps';

/** Rep ranges, effort and weekly charts load together only in the Effort tab. */
export function EffortAnalytics({ from, to }: { readonly from: string; readonly to: string }) {
  const last = new Date(Date.parse(to) - 1).toISOString();
  const query = useDatabaseQuery(`analytics-effort-${from}-${to}`, async () => {
    const [mix, effort] = await Promise.all([database.intensityMix(from, last), database.weeklyEffort(from, last)]);
    return { mix, effort };
  });
  return query.status === 'ready' ? (
    <EffortAndReps mix={query.value.mix} effort={query.value.effort} />
  ) : (
    <EmptyState message={query.status === 'failed' ? query.message : 'Loading…'} />
  );
}
