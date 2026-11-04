import { Clock, Dumbbell, Trophy } from 'lucide-react';
import { Link } from 'react-router';
import type { WorkoutExerciseBest } from '../../../core/queries/WorkoutExerciseBests';
import { volumeText } from '../../format/weightText';
import { ExerciseBestsTable } from './ExerciseBestsTable';
import styles from './HistoryCard.module.css';
import { setCountsText } from './setCountsText';

/** Heuristic: enough exercises to recognise the session at a glance without turning the card into the full workout. */
const EXERCISES_SHOWN = 5;

/**
 * One finished workout in a history list: name and date, its totals, and each exercise with its set count
 * and best set. A single link to the workout, so the whole card is the tap target.
 */
export function HistoryCard({
  to,
  state,
  name,
  dateLine,
  duration,
  setCount,
  warmupCount = 0,
  volumeKilograms,
  bestsCount = 0,
  exercises,
}: {
  readonly to: string;
  readonly state?: unknown;
  readonly name: string;
  readonly dateLine: string;
  /** "82 min", or `undefined` when the workout has no end time. */
  readonly duration: string | undefined;
  readonly setCount: number;
  readonly warmupCount?: number;
  readonly volumeKilograms: number;
  /** Personal bests set in this workout. */
  readonly bestsCount?: number;
  readonly exercises: readonly WorkoutExerciseBest[];
}) {
  return (
    <Link className={styles.card} to={to} state={state}>
      <strong className={styles.name}>{name}</strong>
      <span className={styles.date}>{dateLine}</span>
      <div className={styles.totals}>
        {duration !== undefined && (
          <span className={styles.total}>
            <Clock size={14} strokeWidth={2} aria-hidden />
            {duration}
          </span>
        )}
        <span className={styles.total}>
          <Dumbbell size={14} strokeWidth={2} aria-hidden />
          {volumeText(volumeKilograms)}
        </span>
        {bestsCount > 0 && (
          <span className={styles.total}>
            <Trophy size={14} strokeWidth={2} aria-hidden />
            {bestsCount} {bestsCount === 1 ? 'best' : 'bests'}
          </span>
        )}
        <span className={styles.sets}>{setCountsText(setCount, warmupCount)}</span>
      </div>
      <ExerciseBestsTable label={`${name} exercises`} exercises={exercises} limit={EXERCISES_SHOWN} />
    </Link>
  );
}
