import { parseStrongTimestamp } from '../StrongTimestamp';
import { WorkoutFileUnits } from './WorkoutFileUnits';

/** English month abbreviations used by Hevy's documented export, in calendar order. */
const Months = Object.freeze(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']);

/**
 * Reads numeric local dates/times or Hevy's `26 Oct 2024, 18:00`. Date-only rows use
 * noon local (Heuristic: no recorded time). Local DST gaps/folds follow StrongTimestamp.
 * ISO timestamps with Z or a numeric offset preserve the explicit instant. Impossible calendar
 * dates are rejected before Date.parse can silently normalize them.
 */
export function parseWorkoutTimestamp(text: string): string | undefined {
  const hevy = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (hevy !== null) {
    const [, day = '', monthName = '', year = '', hour = '', minute = '', second = '00'] = hevy;
    const month = Months.indexOf(monthName.toLowerCase()) + 1;
    return parseStrongTimestamp(`${year}-${month}-${day} ${hour}:${minute}:${second}`);
  }
  const numeric =
    /^(\d{4}-\d{1,2}-\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?)?(?:\s?(Z|[+-]\d{2}:?\d{2}))?$/i.exec(
      text,
    );
  if (numeric === null) return undefined;
  const [, day = '', hour = '12', minute = '00', second = '00', fraction = '', zone] = numeric;
  const local = parseStrongTimestamp(`${day} ${hour}:${minute}:${second}`);
  if (local === undefined) return undefined;
  if (zone === undefined) {
    return new Date(Date.parse(local) + Number(`0${fraction}`) * WorkoutFileUnits.millisecondsPerSecond).toISOString();
  }
  const paddedDay = day
    .split('-')
    .map((part) => part.padStart(2, '0'))
    .join('-');
  // Safari's Date.parse refuses an offset without a colon ("+0000"), which real Fitbod exports write.
  const colonZone = /^[+-]\d{4}$/.test(zone) ? `${zone.slice(0, 3)}:${zone.slice(3)}` : zone;
  const instant = Date.parse(`${paddedDay}T${hour.padStart(2, '0')}:${minute}:${second}${fraction}${colonZone}`);
  return Number.isFinite(instant) ? new Date(instant).toISOString() : undefined;
}
