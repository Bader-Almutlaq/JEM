import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { backState } from '../../navigation/backState';
import { LiftSparkline } from './LiftSparkline';
import styles from './Analytics.module.css';

/** A navigable strength row with a sparkline and signed change. */
export function LiftRow({
  to,
  name,
  detail,
  points,
  value,
  change,
  changeText,
  backLabel = 'Back',
}: {
  readonly to: string;
  readonly name: string;
  readonly detail?: ReactNode;
  readonly points: readonly { readonly value: number; readonly deload: boolean }[];
  readonly value: string;
  readonly change: number | null;
  readonly changeText?: string | undefined;
  /** Name of the current screen, shown on the opened screen's back link. */
  readonly backLabel?: string;
}) {
  const location = useLocation();
  return (
    <Link className={styles.lift} to={to} state={backState(location, backLabel)}>
      <span>
        {name}
        {detail}
      </span>
      <LiftSparkline points={points} />
      <span>
        {value}
        <small className={change === null || change === 0 ? styles.neutral : change > 0 ? styles.good : styles.bad}>
          {changeText ?? (change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`)}
        </small>
      </span>
    </Link>
  );
}
