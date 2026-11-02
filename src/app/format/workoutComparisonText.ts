import type { PersonalBest } from '../../core/queries/PersonalBests';
import type { WorkoutSet } from '../../core/models/WorkoutSet';
import type { WeightUnit } from '../../core/units/WeightUnit';
import { estimateText } from './estimateText';
import { volumeText, weightNumberText, weightText } from './weightText';

/** Descriptive signed percentage, omitted when the earlier value is zero. */
export function changeText(current: number, previous: number): string {
  if (previous === 0) return '';
  const percent = Math.round(((current - previous) / previous) * 100);
  return ` (${percent > 0 ? '+' : ''}${percent}%)`;
}

/** "7,943 kg → 8,420 kg (+6%)": the earlier volume, the current one and the descriptive change. */
export function volumeChangeText(current: number, previous: number): string {
  return `${volumeText(previous)} → ${volumeText(current)}${changeText(current, previous)}`;
}

/** Earlier and current top set in the exercise's display unit: "100 × 5 → 102.5 × 5 kg". */
export function topSetChangeText(previous: WorkoutSet, current: WorkoutSet, unit: WeightUnit): string {
  return `${weightNumberText(previous.weightKilograms, unit)} × ${previous.reps} → ${weightNumberText(current.weightKilograms, unit)} × ${current.reps} ${unit}`;
}

/** What a personal best is made of, so a card can lay the parts out and the plain line can join them. */
export interface PersonalBestParts {
  /** "Best e1RM", "Heaviest weight", "Rep best", "Best set volume" or "Best session volume". */
  readonly label: string;
  readonly exercise: string;
  readonly value: string;
  /** The record it replaced, e.g. "was 200 kg". */
  readonly previous: string;
}

/** The parts of one personal best in the exercise's display unit. */
export function personalBestParts(best: PersonalBest): PersonalBestParts {
  const unit = best.exercise.defaultEntryUnit;
  const labels = {
    e1rm: 'Best e1RM',
    weight: 'Heaviest weight',
    reps: 'Rep best',
    setVolume: 'Best set volume',
    sessionVolume: 'Best session volume',
  };
  const reps = best.reps === null ? '' : ` × ${best.reps}`;
  const amount = best.kind === 'e1rm' ? estimateText : weightText;
  return {
    label: labels[best.kind],
    exercise: best.exercise.name,
    value: `${amount(best.value, unit)}${reps}`,
    previous: `was ${amount(best.previous, unit)}${reps}`,
  };
}

/** One plain personal-best line in the exercise's display unit. */
export function personalBestText(best: PersonalBest): string {
  const parts = personalBestParts(best);
  return `${parts.label} · ${parts.exercise} · ${parts.value} (${parts.previous})`;
}
