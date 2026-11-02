import { ArrowDown, ArrowUp, Ellipsis, FileText, Link2, Target, Trash2 } from 'lucide-react';
import { ActionMenu } from '../../design/components/ActionMenu';
import { Chip } from '../../design/components/Chip';
import type { TemplateEditorActions } from './TemplateEditorActions';
import styles from './TemplateExerciseHeader.module.css';

/** The top of a template exercise: its name, a "Superset" tag, and the "…" menu (move, superset, remove). */
export function TemplateExerciseHeader({
  name,
  index,
  count,
  isInSuperset,
  isSupersetWithNext,
  actions,
  onProgression,
  onNote,
  onRepRange,
  hasNote,
}: {
  readonly onProgression?: () => void;
  readonly onNote: () => void;
  readonly onRepRange: () => void;
  readonly hasNote: boolean;
  readonly name: string;
  /** Position in the template (0-based) and the number of exercises, to disable Move up / Move down / Superset at the ends. */
  readonly index: number;
  readonly count: number;
  readonly isInSuperset: boolean;
  readonly isSupersetWithNext: boolean;
  readonly actions: TemplateEditorActions;
}) {
  return (
    <div className={styles.header}>
      <h2 className={styles.name}>{name}</h2>
      {isInSuperset && <Chip tone="accent">Superset</Chip>}
      <ActionMenu
        label="Exercise options"
        items={[
          { label: 'Targets…', icon: Target, onSelect: onRepRange },
          ...(onProgression === undefined ? [] : [{ label: 'Progression…', icon: Target, onSelect: onProgression }]),
          { label: hasNote ? 'Edit note' : 'Add note', icon: FileText, onSelect: onNote },
          { label: 'Move up', icon: ArrowUp, isDisabled: index === 0, onSelect: () => actions.move(index, -1) },
          {
            label: 'Move down',
            icon: ArrowDown,
            isDisabled: index === count - 1,
            onSelect: () => actions.move(index, 1),
          },
          {
            label: 'Superset with next',
            icon: Link2,
            isSelected: isSupersetWithNext,
            isDisabled: index === count - 1,
            onSelect: () => actions.toggleSuperset(index),
          },
          {
            label: 'Remove exercise',
            icon: Trash2,
            isDestructive: true,
            onSelect: () => actions.removeExercise(index),
          },
        ]}
      >
        <Ellipsis size={20} strokeWidth={2} aria-hidden />
      </ActionMenu>
    </div>
  );
}
