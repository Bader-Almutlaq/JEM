import { database, useDatabaseQuery } from '../../data/database';
import { EmptyState } from '../../design/components/EmptyState';
import type { analyticsPeriod } from './analyticsPeriod';
import { SummaryTiles } from './SummaryTiles';
import { StrengthSection } from './StrengthSection';

/** Overview totals and relative strength for the selected end-exclusive period. */
export function AnalyticsDashboard({ range }: { readonly range: ReturnType<typeof analyticsPeriod> }) {
  const start = range.from.toISOString();
  const end = range.to.toISOString();
  const prior = range.previous?.from.toISOString() ?? null;
  const query = useDatabaseQuery(`dashboard-${start}-${end}`, async () => {
    const [overview, strength] = await Promise.all([
      database.analyticsOverview(start, end, prior),
      database.strengthIndex(start, end),
    ]);
    return { overview, strength };
  });
  if (query.status !== 'ready') {
    return <EmptyState message={query.status === 'failed' ? query.message : 'Loading…'} />;
  }
  return (
    <>
      <SummaryTiles
        current={query.value.overview.current}
        previous={query.value.overview.previous}
        weeks={range.weeks}
      />
      <StrengthSection ranking={query.value.strength} weeks={range.weeks} />
    </>
  );
}
