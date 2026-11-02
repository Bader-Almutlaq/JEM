import { useState } from 'react';
import type { ProgressionMode } from '../../../core/logging/ProgressionMode';
import { BottomSheet } from '../../design/components/BottomSheet';
import { Button } from '../../design/components/Button';
import styles from './ProgressionModeSheet.module.css';

/** Per-workout mode choices; Automatic names the core-resolved default, and Targets owns all ranges. */
export function ProgressionModeSheet({
  value,
  automaticMode,
  supportsLoad,
  onSave,
  onCancel,
}: {
  readonly value: ProgressionMode | null;
  readonly automaticMode: ProgressionMode;
  readonly supportsLoad: boolean;
  readonly onSave: (mode: ProgressionMode | null) => void;
  readonly onCancel: () => void;
}) {
  const [selected, setSelected] = useState(value);
  const weightOption: { readonly value: ProgressionMode; readonly label: string } = {
    value: 'weight-first',
    label: 'Weight first',
  };
  const options: readonly { readonly value: ProgressionMode | null; readonly label: string }[] = [
    { value: null, label: `Automatic (${automaticMode === 'weight-first' ? 'weight first' : 'reps first'})` },
    { value: 'reps-first', label: 'Reps first' },
    ...(supportsLoad ? [weightOption] : []),
    { value: 'off', label: 'Off' },
  ];
  return (
    <BottomSheet title="Progression" onClose={onCancel}>
      <fieldset className={styles.options}>
        <legend className={styles.hint}>Suggestions to accept with a tap</legend>
        {options.map((option) => (
          <label className={styles.option} key={option.value ?? 'automatic'}>
            <input
              type="radio"
              name="progression-mode"
              checked={selected === option.value}
              onChange={() => setSelected(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      <p className={styles.hint}>Rep and RPE ranges come from Targets…</p>
      <Button variant="primary" onPress={() => onSave(selected)}>
        Save
      </Button>
    </BottomSheet>
  );
}
