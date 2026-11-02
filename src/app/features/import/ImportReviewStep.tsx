import { makeImportOptions, type StrongImportOptions } from '../../../core/import/StrongImportOptions';
import type { StrongImportPlan } from '../../../core/import/StrongImportPlan';
import { database, useDatabaseQuery } from '../../data/database';
import { FindingGroupCard } from './FindingGroupCard';
import { groupFindings, type FindingItem } from './importFindingText';
import { ImportTotalsSection } from './ImportTotalsSection';
import { PoundExercisesSection } from './PoundExercisesSection';
import styles from './StrongImportScreen.module.css';
// The review screen unmounts while its plan is rebuilt. Associate undo data with the
// immutable exclusion set passed through that rebuild, so a new import starts cleanly.
const bulkUndo = new WeakMap<ReadonlySet<number>, ReadonlySet<number>>();

/** Leaves out unique flagged lines, or restores the exclusion decisions before the bulk action. */
export function toggleBulkExclusions(
  excludedLines: ReadonlySet<number>,
  flaggedLines: readonly number[],
): ReadonlySet<number> {
  const previous = bulkUndo.get(excludedLines);
  if (previous !== undefined) return new Set(previous);
  const next = new Set([...excludedLines, ...flaggedLines]);
  bulkUndo.set(next, new Set(excludedLines));
  return next;
}

/** Carries bulk undo through a per-set exclusion change. */
export function updateExclusions(
  excludedLines: ReadonlySet<number>,
  lines: readonly number[],
  excluded: boolean,
): ReadonlySet<number> {
  const next = new Set(excludedLines);
  for (const line of lines) {
    if (excluded) next.add(line);
    else next.delete(line);
  }
  const previous = bulkUndo.get(excludedLines);
  if (previous !== undefined) bulkUndo.set(next, previous);
  return next;
}

/** Shows import totals, unit choices and suspicious-set review. */
export function ImportReviewStep({
  plan,
  options,
  review,
  apply,
  keep,
  edit,
  runImport,
}: {
  plan: StrongImportPlan;
  options: StrongImportOptions;
  review: (options: StrongImportOptions) => void;
  apply: (items: readonly FindingItem[]) => void;
  keep: (items: readonly FindingItem[]) => void;
  edit: (item: FindingItem) => void;
  runImport: () => void;
}) {
  const groups = groupFindings(plan);
  const setExcluded = (items: readonly FindingItem[], excluded: boolean) => {
    const excludedLines = updateExclusions(
      options.excludedLines,
      items.map((item) => item.finding.id),
      excluded,
    );
    review({ ...options, excludedLines });
  };
  const flaggedLines = [...new Set(plan.findings.map((finding) => finding.id))];
  const flaggedCount = flaggedLines.length;
  const totalSets = plan.setsByLine.size;
  const percentage = totalSets === 0 ? '0.0' : ((flaggedCount / totalSets) * 100).toFixed(1);
  const canUndoBulk = bulkUndo.has(options.excludedLines);
  const decisionCount = options.corrections.size + options.confirmedLines.size + options.excludedLines.size;
  const counts = useDatabaseQuery(
    // The key names this plan's workouts, so a second file reviewed soon after never shows the first file's counts.
    `strong-import-counts-${plan.workouts.length}-${plan.workouts[0]?.startedAt ?? ''}-${plan.workouts.at(-1)?.startedAt ?? ''}`,
    () => database.strongImportWorkoutCounts(plan.workouts),
  );
  return (
    <>
      <ImportTotalsSection plan={plan} />
      {counts.status === 'ready' && (
        <p className={styles.note}>
          {counts.value.alreadyImported} already imported · {counts.value.newWorkouts} new
        </p>
      )}
      {counts.status === 'failed' && <p className={styles.note}>{counts.message}</p>}
      <PoundExercisesSection plan={plan} options={options} review={review} />
      <section>
        <div className={styles.heading}>
          <h2>Check these sets ({plan.findings.length})</h2>
          {decisionCount > 0 && (
            <button className={styles.link} onClick={() => review(makeImportOptions())}>
              Reset {decisionCount} {decisionCount === 1 ? 'decision' : 'decisions'}
            </button>
          )}
        </div>
        {groups.length === 0 && !canUndoBulk ? (
          <p className={styles.description}>Nothing looks like a typo.</p>
        ) : (
          <div>
            <button
              className={styles.primary}
              onClick={() =>
                review({ ...options, excludedLines: toggleBulkExclusions(options.excludedLines, flaggedLines) })
              }
            >
              {canUndoBulk ? 'Undo' : `Leave out all ${flaggedCount} flagged sets`}
            </button>
            <p className={styles.note}>
              {flaggedCount} of {totalSets} sets ({percentage}%) differ a lot from nearby sessions. Leaving them out
              keeps typos out of your charts; your export file is unchanged.
            </p>
          </div>
        )}
        {groups.map((group) => (
          <FindingGroupCard
            key={group.key}
            group={group}
            apply={apply}
            keep={keep}
            edit={edit}
            excludedLines={options.excludedLines}
            setExcluded={setExcluded}
          />
        ))}
      </section>
      <div>
        <button
          className={styles.primary}
          onClick={runImport}
          disabled={counts.status !== 'ready' || (counts.value.newWorkouts === 0 && plan.measurements.length === 0)}
        >
          {counts.status === 'ready' && counts.value.newWorkouts === 0 && plan.measurements.length === 0
            ? 'Nothing new to import'
            : counts.status === 'ready' && counts.value.newWorkouts === 0
              ? 'Import measurements'
              : `Import ${counts.status === 'ready' ? counts.value.newWorkouts.toLocaleString() : '…'} ${counts.status === 'ready' && counts.value.newWorkouts === 1 ? 'workout' : 'workouts'}`}
        </button>
        {plan.findings.length > 0 && <p className={styles.note}>Sets you haven't reviewed import as logged.</p>}
      </div>
    </>
  );
}
