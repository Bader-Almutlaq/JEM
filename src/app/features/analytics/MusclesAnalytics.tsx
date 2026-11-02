import { database, useDatabaseQuery } from '../../data/database';
import { EmptyState } from '../../design/components/EmptyState';
import type { AnalyticsPeriod } from './analyticsPeriod';
import { MuscleDashboardTable } from './MuscleDashboardTable';

/** The muscle table loads only while its tab is selected; the worker uses inclusive end dates. */
export function MusclesAnalytics({
  from,
  to,
  period,
}: {
  readonly from: string;
  readonly to: string;
  readonly period: AnalyticsPeriod;
}) {
  const query = useDatabaseQuery(`analytics-muscles-${from}-${to}`, () =>
    database.muscleDashboard(from, new Date(Date.parse(to) - 1).toISOString()),
  );
  return query.status === 'ready' ? (
    <MuscleDashboardTable muscles={query.value} period={period} />
  ) : (
    <EmptyState message={query.status === 'failed' ? query.message : 'Loading…'} />
  );
}
