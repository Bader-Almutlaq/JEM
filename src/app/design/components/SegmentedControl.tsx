import type { CSSProperties } from 'react';
import styles from './SegmentedControl.module.css';

/**
 * A row of mutually exclusive options, like iOS's segmented control. The selected pill is one element
 * that slides between segments (transform only), so a change reads as movement, not a swap.
 */
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** Read by screen readers; not shown. */
  readonly label: string;
  readonly options: readonly { readonly value: Value; readonly label: string }[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
}) {
  const selectedIndex = options.findIndex((option) => option.value === value);
  // Custom properties are not in CSSProperties; the object holds only two numbers, so the cast is safe.
  const indicatorStyle = {
    '--segment-index': Math.max(0, selectedIndex),
    '--segment-count': Math.max(1, options.length),
  } as CSSProperties;
  return (
    <div className={styles.control} role="radiogroup" aria-label={label}>
      <span className={styles.indicator} style={indicatorStyle} data-empty={selectedIndex < 0} aria-hidden />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={styles.option}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
