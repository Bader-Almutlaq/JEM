import { useEffect, useRef, useState } from 'react';
import {
  RestTimerDefaults,
  restState,
  restTarget,
  steppedRestTarget,
  restRangeState,
} from '../../../core/logging/RestTimer';
import { log } from '../../../core/support/log';
import type { LiveWorkoutEntry } from '../../../core/queries/LiveWorkout';
import { latestCompletion } from './latestCompletion';
import type { RestBarModel } from './RestBarModel';
import { useClock } from './useClock';
import { setRestTarget } from './workoutActions';

/** Heuristic: a short, softer second tone distinguishes the upper boundary. */
const RestAlert = { durationSeconds: 0.15, normalVolume: 0.15, quietVolume: 0.05 } as const;

/** The target the owner last chose, which the saved value may not show yet. */
interface ChosenTarget {
  readonly exerciseId: number;
  readonly seconds: number;
}

/**
 * The rest bar's state, counted from the most recently completed set. `undefined` when no set is
 * completed or the owner dismissed the bar for that set. Nothing is stored for the countdown: it
 * is worked out from the set's saved time, so it survives a reload.
 */
export function useRestBar(entries: readonly LiveWorkoutEntry[]): RestBarModel | undefined {
  const now = useClock();
  const [dismissedCompletedAt, setDismissedCompletedAt] = useState<string | undefined>(undefined);
  const lastChosen = useRef<ChosenTarget | undefined>(undefined);
  const completion = latestCompletion(entries);
  const elapsed =
    completion === undefined
      ? 0
      : restState(completion.completedAt, restTarget(completion.exercise), now).elapsedSeconds;
  const high = completion?.exercise.restMaxSeconds ?? null;
  const phase =
    completion === undefined ? 'before' : restRangeState(elapsed, restTarget(completion.exercise), high).phase;
  const previous = useRef<{ completedAt: string; phase: string } | undefined>(undefined);
  const completedAtForAlert = completion?.completedAt;
  useEffect(() => {
    if (completedAtForAlert === undefined) return;
    const prior = previous.current;
    previous.current = { completedAt: completedAtForAlert, phase };
    if (
      prior === undefined ||
      prior.completedAt !== completedAtForAlert ||
      prior.phase === phase ||
      prior.phase === 'finished'
    )
      return;
    if (phase === 'between' || phase === 'finished') {
      try {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        gain.gain.value = phase === 'between' || high === null ? RestAlert.normalVolume : RestAlert.quietVolume;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + RestAlert.durationSeconds);
        oscillator.onended = () => {
          void context.close();
        };
      } catch (error) {
        log.ui.error('Rest alert failed', error);
      }
    }
  }, [completedAtForAlert, phase, high]);
  if (completion === undefined || completion.completedAt === dismissedCompletedAt) return undefined;

  const { exercise, completedAt } = completion;
  const targetSeconds = restTarget(exercise);
  // Taps arrive faster than the saved value comes back, so a step starts from the last one chosen.
  const step = (direction: 1 | -1) => {
    const previous = lastChosen.current;
    const base = previous?.exerciseId === exercise.id ? previous.seconds : targetSeconds;
    const seconds = steppedRestTarget(base, direction);
    lastChosen.current = { exerciseId: exercise.id, seconds };
    setRestTarget(exercise.id, seconds);
  };
  return {
    state: restState(completedAt, targetSeconds, now),
    targetSeconds,
    range: restRangeState(elapsed, targetSeconds, high),
    canShorten: targetSeconds > RestTimerDefaults.minimumSeconds,
    canLengthen: targetSeconds < RestTimerDefaults.maximumSeconds,
    shorten: () => step(-1),
    lengthen: () => step(1),
    dismiss: () => setDismissedCompletedAt(completedAt),
  };
}
