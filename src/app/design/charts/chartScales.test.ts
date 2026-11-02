import { describe, expect, it } from 'vitest';
import { ChartLayout, axisLabelAnchor, chartScales, chartDateLabels } from './chartScales';

const points = [
  { date: '2026-03-01', value: 100 },
  { date: '2026-03-08', value: 105 },
  { date: '2026-03-15', value: 110 },
];

describe('chartScales', () => {
  it('maps dates left to right and larger values upward, without a zero baseline', () => {
    const scales = chartScales(points, 398);
    expect(scales.x(new Date('2026-03-01'))).toBe(scales.left);
    expect(scales.x(new Date('2026-03-15'))).toBe(scales.right);
    expect(scales.y(110)).toBeLessThan(scales.y(100));
    expect(scales.y.domain()).toEqual([95, 115]);
    expect(scales.gridValues).toEqual([95, 100, 105, 110, 115]);
  });

  it('includes held session outliers alongside the trend', () => {
    const scales = chartScales([...points, { date: '2026-03-22', value: 200 }], 398);
    expect(scales.y(200)).toBeGreaterThan(scales.top);
    expect(scales.y(100)).toBeLessThan(scales.bottom);
  });

  it('expands a flat series and a single date', () => {
    const scales = chartScales([{ date: '2026-03-01', value: 100 }], 398);
    expect(scales.y.domain()).toEqual([95, 105]);
    expect(scales.x.domain().map(Number)).toEqual([
      Date.parse('2026-03-01') - ChartLayout.singleDatePaddingMilliseconds,
      Date.parse('2026-03-01') + ChartLayout.singleDatePaddingMilliseconds,
    ]);
  });

  it('provides finite fallback domains and bounds for empty or invalid data', () => {
    const scales = chartScales([{ date: 'invalid', value: NaN }], NaN);
    expect(scales.y.domain()).toEqual([-1, 1]);
    expect(scales.x.domain().every((date) => Number.isFinite(Number(date)))).toBe(true);
    expect(scales.right).toBeGreaterThan(scales.left);
    expect(scales.gridValues.length).toBeGreaterThan(1);
  });

  it('resizes the range without changing domains', () => {
    const narrow = chartScales(points, 200);
    const wide = chartScales(points, 430);
    expect(narrow.x.domain()).toEqual(wide.x.domain());
    expect(narrow.y.domain()).toEqual(wide.y.domain());
    expect(wide.right - narrow.right).toBe(230);
  });
});

describe('chart polish', () => {
  it('uses nice domains and round d3 ticks instead of fractional interpolated gridlines', () => {
    const scales = chartScales(
      [
        { date: '2026-01-01', value: 104.9 },
        { date: '2026-02-01', value: 113.7 },
      ],
      398,
    );
    expect(scales.gridValues).toEqual(scales.y.ticks(3));
    expect(scales.gridValues.every(Number.isInteger)).toBe(true);
    expect(scales.y.domain()).toEqual([100, 115]);
  });

  it('allows a forced zero baseline including empty and flat positive inputs', () => {
    for (const data of [points, [], [{ date: '2026-01-01', value: 0 }]]) {
      const scales = chartScales(data, 398, { zeroBaseline: true });
      expect(scales.y.domain()[0]).toBe(0);
      expect(scales.y.domain()[1]).toBeGreaterThan(0);
      expect(scales.gridValues).toContain(0);
    }
  });

  it('labels short ranges with days and longer ranges with months and explicit years', () => {
    const short = chartDateLabels(chartScales(points, 398));
    expect(short.some((label) => label.text === 'Mar 8')).toBe(true);
    const long = chartDateLabels(
      chartScales(
        [
          { date: '2026-10-01', value: 1 },
          { date: '2027-04-01', value: 2 },
        ],
        398,
      ),
    );
    expect(long[0]?.text).toBe('Oct 2026');
    expect(long.some((label) => label.text === 'Jan 2027')).toBe(true);
    expect(long.at(-1)?.text).toBe('Apr');
  });
});

it('keeps between three and five date labels on sparse short spans and identifies a crossed year', () => {
  const scales = chartScales(
    [
      { date: '2026-12-01', value: 1 },
      { date: '2027-01-30', value: 2 },
    ],
    430,
  );
  const labels = chartDateLabels(scales);
  expect(labels.length).toBeGreaterThanOrEqual(3);
  expect(labels.length).toBeLessThanOrEqual(5);
  expect(labels.some((label) => label.text.includes('2026'))).toBe(true);
  expect(labels.some((label) => label.text.includes('2027'))).toBe(true);
});

describe('plot width', () => {
  it('starts the plot at the content edge, with no label gutter, and keeps a small right padding', () => {
    const scales = chartScales(points, 398);
    expect(scales.left).toBe(0);
    expect(scales.x(new Date('2026-03-01'))).toBe(0);
    expect(scales.right).toBe(398 - ChartLayout.padding.right);
    expect(ChartLayout.padding.right).toBeLessThanOrEqual(12);
  });

  it('anchors edge date labels inward so the first and last never clip', () => {
    expect(axisLabelAnchor(0, 'Oct 2026', 398)).toBe('start');
    expect(axisLabelAnchor(398, 'Apr', 398)).toBe('end');
    expect(axisLabelAnchor(200, 'Jan 2027', 398)).toBe('middle');
  });
});
