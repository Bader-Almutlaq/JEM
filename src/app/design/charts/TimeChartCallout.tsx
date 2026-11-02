import { ChevronRight } from 'lucide-react';
import type { TimeChartModel } from './timeChartModel';
import type { TimeChartProps } from './TimeChart.types';
import { clampCallout } from './timeChartMath';
import { chartPeriodText } from './chartPeriodText';
import styles from './TimeChart.module.css';

/** Temporary period/value bubble in the accent colour (bold date, title-size value), clamped above the plot; short expanded taps can open the selected session. */
export function TimeChartCallout({
  model,
  date,
  props,
  width,
  openable,
}: {
  readonly model: TimeChartModel;
  readonly date: string;
  readonly props: TimeChartProps;
  readonly width: number;
  readonly openable: boolean;
}) {
  return (
    <div className={styles.callout} style={{ left: clampCallout(model.scales.x(new Date(date)), width) }} role="status">
      <strong className={styles.calloutPeriod}>
        {chartPeriodText(
          date,
          model.size,
          model.series.flatMap((item) => item.points).find((point) => point.date === date)?.span ?? 1,
        )}
      </strong>
      {model.series.map((item, index) => {
        const point = item.points.find((point) => point.date === date);
        return (
          <div key={item.name} className={`${styles.calloutValue} ${styles.series}`} data-series={index}>
            <span className={styles.calloutDot} aria-hidden />
            {model.series.length > 1 ? `${item.name}: ` : ''}
            <span className={styles.calloutAmount}>
              {point?.value === null || point === undefined ? '—' : props.formatValue(point.value)}
            </span>
            {point?.deload ? ' · Deload' : ''}
            {openable &&
              point?.sources.length === 1 &&
              point.sources[0]?.sessionId !== undefined &&
              props.onOpenPoint !== undefined && (
                <button
                  type="button"
                  className={styles.open}
                  aria-label={`Open ${item.name} session`}
                  onClick={() => {
                    const source = point.sources[0];
                    if (source !== undefined) props.onOpenPoint?.(source);
                  }}
                >
                  Open
                  <ChevronRight size={16} aria-hidden />
                </button>
              )}
          </div>
        );
      })}
    </div>
  );
}
