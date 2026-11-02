/** Heuristic: equal-weight relative strength, weekly samples, and ±1% noise tolerance keep heavy lifts from dominating. */
export const StrengthIndexPolicy = Object.freeze({
  percent: 100,
  flatChangePercent: 1,
  daysPerWeek: 7,
});

/** A smoothed lift estimate in kg at an ISO timestamp; deload observations never contribute. */
export interface StrengthIndexObservation {
  readonly date: string;
  readonly e1rmKilograms: number;
  readonly deload?: boolean;
}

/** A weekly median relative change in percent; contributors excludes lifts that have not started yet. */
export interface StrengthIndexPoint {
  readonly date: string;
  readonly changePercent: number;
  readonly contributors: number;
}

/** Median of finite percentage changes, averaging the middle pair for even counts; null for no data. */
export function medianStrengthChange(changes: readonly number[]): number | null {
  const values = changes.filter(Number.isFinite).toSorted((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  const upper = values[middle];
  if (upper === undefined) return null;
  return values.length % 2 === 1 ? upper : ((values[middle - 1] ?? upper) + upper) / 2;
}

/** Counts finite lift percentage changes; exactly −1% and +1% are flat, not down/up. Heuristic: trend noise is around 1%. */
export function strengthChangeCounts(changes: readonly number[]) {
  let up = 0;
  let flat = 0;
  let down = 0;
  for (const change of changes.filter(Number.isFinite)) {
    if (change > StrengthIndexPolicy.flatChangePercent) up += 1;
    else if (change < -StrengthIndexPolicy.flatChangePercent) down += 1;
    else flat += 1;
  }
  return { up, flat, down };
}

/**
 * Heuristic: median((current smoothed kg / baseline smoothed kg − 1) × 100), one vote per counted lift.
 * The query supplies lifts with ≥2 qualifying non-deload sessions in [from, to).
 * Baseline is the last value at/before from, otherwise the first value inside the period.
 * A late-starting lift joins only once observed; values carry forward without interpolation.
 * Samples start at 0%, then every seven local calendar days and at the exclusive end minus 1 ms.
 * Deloads, invalid points and future points are ignored; empty/invalid ranges return no series.
 */
export function strengthIndex(
  lifts: readonly (readonly StrengthIndexObservation[])[],
  from: Date,
  to: Date,
): readonly StrengthIndexPoint[] {
  const start = from.getTime();
  const end = to.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const series = lifts.flatMap((lift) => {
    const points = lift
      .filter((point) => {
        const time = Date.parse(point.date);
        return (
          !point.deload &&
          Number.isFinite(time) &&
          time < end &&
          Number.isFinite(point.e1rmKilograms) &&
          point.e1rmKilograms > 0
        );
      })
      .toSorted((left, right) => Date.parse(left.date) - Date.parse(right.date));
    const baseline = points.filter((point) => Date.parse(point.date) <= start).at(-1) ?? points[0];
    return baseline === undefined ? [] : [{ baseline, points, cursor: 0 }];
  });
  if (series.length === 0) return [];
  const dates = [new Date(from)];
  const next = new Date(from);
  next.setDate(next.getDate() + StrengthIndexPolicy.daysPerWeek);
  while (next.getTime() < end - 1) {
    dates.push(new Date(next));
    next.setDate(next.getDate() + StrengthIndexPolicy.daysPerWeek);
  }
  if (end - 1 > start) dates.push(new Date(end - 1));
  return dates.map((date) => {
    const changes = series.flatMap((lift) => {
      while (
        lift.cursor + 1 < lift.points.length &&
        Date.parse(lift.points[lift.cursor + 1]?.date ?? '') <= date.getTime()
      ) {
        lift.cursor += 1;
      }
      const current = lift.points[lift.cursor];
      if (current === undefined || Date.parse(current.date) > date.getTime()) return [];
      return [(current.e1rmKilograms / lift.baseline.e1rmKilograms - 1) * StrengthIndexPolicy.percent];
    });
    return {
      date: date.toISOString(),
      changePercent: medianStrengthChange(changes) ?? 0,
      contributors: changes.length,
    };
  });
}
