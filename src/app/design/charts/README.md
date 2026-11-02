# charts

SVG charts drawn by React, with `d3-scale` and `d3-shape` for the maths and no chart framework.

`TimeChart` is the one dated chart: aggregation for the visible span, gaps, deload marks, trend line, press-and-drag callout, landscape pinch-zoom and a table view. Its maths is in `timeChartMath.ts`, the model in `timeChartModel.ts` and gestures in `useTimeChartGesture.ts`. `ChartFrame`, `ChartTable` and `TablePill` are the shared frame and table. Use `TimeChart` for any new dated series instead of drawing a new chart.
