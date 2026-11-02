/**
 * Reads a rest time typed by the owner and returns whole seconds, or `NaN` when it is not a time.
 * Accepted: plain seconds ("120"), seconds with a unit ("90s"), minutes ("3m", "1.5m"), both ("2m30s",
 * "2m 30s") and a clock reading ("2:00", "1:30"). Blank input means "not set" and returns `null`.
 * Hours are not supported: a rest is never that long. The caller checks the limits.
 */
export function parseRestDuration(text: string): number | null {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === '') return null;
  const clock = /^(\d+):([0-5]\d)$/.exec(trimmed);
  if (clock !== null) return Number(clock[1]) * SECONDS_PER_MINUTE + Number(clock[2]);
  const units = /^(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec)?)?$/.exec(trimmed);
  if (units !== null && (units[1] !== undefined || units[2] !== undefined)) {
    return Math.round(Number(units[1] ?? 0) * SECONDS_PER_MINUTE + Number(units[2] ?? 0));
  }
  return /^\d+(?:\.\d+)?$/.test(trimmed) ? Math.round(Number(trimmed)) : Number.NaN;
}

const SECONDS_PER_MINUTE = 60;
