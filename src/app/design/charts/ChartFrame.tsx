import type { ReactNode } from 'react';
import { ChartLayout, axisLabelAnchor, chartDateLabels, type ChartScales } from './chartScales';
import styles from './ChartFrame.module.css';
import { compactTick } from './compactTick';

/**
 * SVG plot with round value gridlines, dated axis labels and horizontal gridlines only (DESIGN.md → Charts).
 * Gridlines span the full width; value labels sit inside the plot just above their gridline (the unit on the
 * top one), drawn over the marks with a surface-coloured halo so a line passing behind stays legible.
 */
export function ChartFrame({
  width,
  scales,
  label,
  height = ChartLayout.height,
  children,
  formatTick = compactTick,
  unit,
}: {
  readonly unit?: string;
  readonly width: number;
  readonly scales: ChartScales;
  readonly label: string;
  readonly height?: number;
  readonly children: ReactNode;
  readonly formatTick?: (value: number) => string;
}) {
  const labels = chartDateLabels(scales);
  const ticks = scales.gridValues.filter((value) => formatTick(value) !== '');
  return (
    <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} aria-label={label} role="group">
      {ticks.map((value) => (
        <line
          key={value}
          className={styles.grid}
          x1={scales.left}
          x2={width}
          y1={scales.y(value)}
          y2={scales.y(value)}
        />
      ))}
      {children}
      {ticks.map((value) => (
        <text
          key={value}
          className={`${styles.label} ${styles.valueLabel}`}
          x={scales.left}
          y={scales.y(value) - ChartLayout.valueLabelLift}
          textAnchor="start"
        >
          {formatTick(value)}
          {value === scales.gridValues.at(-1) && unit ? ` ${unit}` : ''}
        </text>
      ))}
      {labels.map(({ date, text }) => {
        const x = scales.x(date);
        return (
          <text
            key={date.toISOString()}
            className={styles.label}
            x={x}
            y={height - ChartLayout.padding.bottom / 4}
            textAnchor={axisLabelAnchor(x, text, width)}
          >
            {text}
          </text>
        );
      })}
    </svg>
  );
}
