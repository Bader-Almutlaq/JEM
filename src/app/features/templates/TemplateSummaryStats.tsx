import { rpeNumberText } from '../../format/setText';
import { SummaryStat } from '../workout/SummaryStat';
import styles from './TemplateSummaryStats.module.css';
import type { TemplateStats } from '../../../core/templates/TemplateStats';

/** The running totals of the workout being built: exercises, working sets and, when planned, average target RPE. */
export function TemplateSummaryStats({ stats }: { readonly stats: TemplateStats }) {
  return (
    <div className={styles.stats} role="group" aria-label="Workout totals">
      <SummaryStat label="Exercises" value={String(stats.exercises)} />
      <SummaryStat label="Sets" value={String(stats.workingSets)} />
      {stats.warmupSets > 0 && <SummaryStat label="Warm-ups" value={String(stats.warmupSets)} />}
      {stats.averageRpe !== null && (
        <SummaryStat label="Avg RPE" value={rpeNumberText(Math.round(stats.averageRpe * 10) / 10)} />
      )}
    </div>
  );
}
