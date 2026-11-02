import { ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ElapsedClock } from './ElapsedClock';
import styles from './ResumeWorkoutBar.module.css';
import { resumeWorkout } from './workoutMinimized';

/** The strip above the tab bar while a workout is in progress but not on screen: its name, clock, and a tap to return. */
export function ResumeWorkoutBar({ name, startedAt }: { readonly name: string; readonly startedAt: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={styles.bar}
      onClick={() => {
        resumeWorkout();
        navigate('/');
      }}
    >
      <span className={styles.name}>{name}</span>
      <span className={styles.end}>
        <ElapsedClock startedAt={startedAt} />
        <ChevronUp size={18} strokeWidth={2} aria-hidden />
        <span className={styles.label}>Resume</span>
      </span>
    </button>
  );
}
