import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { database, useDatabaseQuery } from '../../data/database';
import { Screen } from '../../design/components/Screen';
import { EmptyState } from '../../design/components/EmptyState';
import { SegmentedControl } from '../../design/components/SegmentedControl';
import { analyticsPeriod, type AnalyticsPeriod } from './analyticsPeriod';
import { analyticsTab, analyticsTabs } from './analyticsTabs';
import { PeriodChips } from './PeriodChips';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { MusclesAnalytics } from './MusclesAnalytics';
import { EffortAnalytics } from './EffortAnalytics';
import { PinnedLifts } from './PinnedLifts';
import { ActivePlanRow } from './ActivePlanRow';

/** Four Analytics views sharing a URL-persisted period and pin-aware initial selection. */
export function AnalyticsScreen() {
  const [params, setParams] = useSearchParams();
  const periods: readonly AnalyticsPeriod[] = ['4W', '12W', '6M', '1Y', 'All'];
  const period = periods.find((item) => item === params.get('period')) ?? '12W';
  const first = useDatabaseQuery('first-finished-workout', () => database.firstFinishedWorkout());
  const pins = useDatabaseQuery('analytics-pinned-lifts', () => database.pinnedExercises());
  const tab = analyticsTab(params.get('tab'), pins.status === 'ready' && pins.value.length > 0);
  const explicitTab = analyticsTabs.some((item) => item.value === params.get('tab'));
  useEffect(() => {
    if (explicitTab || pins.status !== 'ready') return;
    // Persist the resolved default before pin edits can change it or a detail page is opened.
    const next = new URLSearchParams(params);
    next.set('tab', tab);
    setParams(next, { replace: true });
  }, [explicitTab, pins.status, params, setParams, tab]);
  const ready = first.status === 'ready' && (explicitTab || pins.status === 'ready');
  const range = analyticsPeriod(period, new Date(), first.status === 'ready' ? first.value : null);
  const from = range.from.toISOString();
  const to = range.to.toISOString();
  return (
    <Screen title="Analytics">
      <SegmentedControl
        label="Analytics views"
        options={analyticsTabs}
        value={tab}
        onChange={(value) => {
          const next = new URLSearchParams(params);
          next.set('tab', value);
          setParams(next);
        }}
      />
      <PeriodChips
        value={period}
        onChange={(value) => {
          const next = new URLSearchParams(params);
          next.set('period', value);
          next.set('tab', tab);
          setParams(next);
        }}
      />
      {ready ? (
        <>
          {tab === 'pinned' && (
            <>
              <PinnedLifts from={from} to={to} />
              <ActivePlanRow />
            </>
          )}
          {tab === 'overview' && <AnalyticsDashboard range={range} />}
          {tab === 'muscles' && <MusclesAnalytics from={from} to={to} period={period} />}
          {tab === 'effort' && <EffortAnalytics from={from} to={to} />}
        </>
      ) : (
        <EmptyState
          message={first.status === 'failed' ? first.message : pins.status === 'failed' ? pins.message : 'Loading…'}
        />
      )}
    </Screen>
  );
}
