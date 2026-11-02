import { chartTimestamp } from './chartTimestamp';
import { LinearTrend } from '../../../core/analytics/LinearTrend';
import { chartScales } from './chartScales';
import { bucketChartSeries, chooseChartBucket, splitChartGaps, TimeChartPolicy } from './timeChartMath';
import type { TimeChartDomain, TimeChartProps } from './TimeChart.types';

/** Display-only model shared by compact and expanded renderers; aggregation and regression have one owner each. */
export function timeChartModel(
  props: TimeChartProps,
  domain: TimeChartDomain,
  width: number,
  height: number,
  expanded: boolean,
) {
  const count = Math.max(
    0,
    ...props.series.map(
      (item) =>
        item.points.filter((point) => {
          const timestamp = chartTimestamp(point.date);
          return timestamp >= domain.from && timestamp <= domain.to;
        }).length,
    ),
  );
  const size = chooseChartBucket(
    domain,
    expanded ? TimeChartPolicy.expandedMarks : TimeChartPolicy.inlineMarks,
    count,
    expanded,
  );
  const series = props.series.map((item) => {
    const points = bucketChartSeries(
      item,
      domain,
      size,
      props.aggregation,
      props.marks,
      expanded ? TimeChartPolicy.expandedMarks : TimeChartPolicy.inlineMarks,
    );
    const normal = points.flatMap((point) =>
      point.trendValue === null ? [] : [{ date: point.date, value: point.trendValue }],
    );
    const fit = props.trend ? LinearTrend(normal) : null;
    const endpoints =
      fit === null
        ? []
        : [normal[0], normal.at(-1)].flatMap((point) =>
            point === undefined
              ? []
              : [
                  {
                    date: point.date,
                    value:
                      fit.intercept +
                      (fit.slopePerDay * (Date.parse(point.date) - Date.parse(fit.origin))) / TimeChartPolicy.day,
                  },
                ],
          );
    return { name: item.name, points, segments: splitChartGaps(points, size), trend: endpoints };
  });
  const values = series.flatMap((item) => [
    ...item.points.flatMap((point) => (point.value === null ? [] : [{ date: point.date, value: point.value }])),
    ...item.trend,
  ]);
  const options = { height, zeroBaseline: props.kind === 'bars' };
  const scales = chartScales(values, width, options);
  // D3 tick count is a hint; limit the phone axis to four round labels.
  const gridValues =
    scales.gridValues.length > TimeChartPolicy.maximumAxisTicks
      ? scales.gridValues.filter((_, index) => index % TimeChartPolicy.tickStride === 0)
      : scales.gridValues;
  const firstBucket = series
    .flatMap((item) => item.points)
    .reduce((first, point) => Math.min(first, Date.parse(point.date)), domain.from);
  scales.x.domain([new Date(firstBucket), new Date(domain.to)]);
  const dates = [...new Set(series.flatMap((item) => item.points.map((point) => point.date)))].toSorted(
    (a, b) => Date.parse(a) - Date.parse(b),
  );
  if (props.kind === 'bars') {
    const inset = Math.min(
      (TimeChartPolicy.maximumBarWidth * series.length) / 2,
      (((scales.right - scales.left) / Math.max(1, dates.length)) * TimeChartPolicy.barFraction) / 2,
    );
    scales.x.range([scales.left + inset, scales.right - inset]);
  }
  return { size, series, dates, scales: { ...scales, gridValues } };
}

/** The fully derived plotting model, including calendar buckets and per-series regression endpoints. */
export type TimeChartModel = ReturnType<typeof timeChartModel>;
