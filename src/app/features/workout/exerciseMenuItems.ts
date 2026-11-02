import { ArrowDown, ArrowLeftRight, ArrowUp, ListPlus, Trash2, Factory } from 'lucide-react';
import { usesMachineBrand } from '../../../core/library/MachineBrands';
import type { LiveWorkoutEntry } from '../../../core/queries/LiveWorkout';
import type { WeightUnit } from '../../../core/units/WeightUnit';
import type { ActionMenuItem } from '../../design/components/ActionMenuRow';
import type { ExerciseCardActions } from './ExerciseCardActions';
import { recordsWeight } from './trackingKinds';

/** Existing exercise operations only; unsupported sticky notes, replacement and supersets are omitted. */
export function exerciseMenuItems({
  entry,
  index,
  count,
  actions,
  unit,
  live,
}: {
  readonly entry: LiveWorkoutEntry;
  readonly index: number;
  readonly count: number;
  readonly actions: ExerciseCardActions;
  readonly unit: WeightUnit;
  /** UI-only actions supplied by live cards; history keeps its existing menu. */
  readonly live?:
    | {
        readonly editDeload?: () => void;
        readonly editMachine?: () => void;
      }
    | undefined;
}): readonly ActionMenuItem[] {
  const entryId = entry.entry.id;
  return [
    ...(live !== undefined && actions.setDeload !== undefined
      ? [
          {
            label: 'Deload…',
            isDeload: true,
            onSelect: () => live.editDeload?.(),
          },
        ]
      : []),
    ...(live === undefined
      ? []
      : [{ label: 'Add warm-up set', icon: ListPlus, onSelect: () => actions.addSet(entryId, 'warmup') }]),
    ...(live?.editMachine !== undefined && usesMachineBrand(entry.exercise.equipment)
      ? [{ label: 'Machine…', icon: Factory, onSelect: live.editMachine }]
      : []),
    ...(live !== undefined && recordsWeight(entry.exercise.tracking)
      ? [
          {
            label: `Unit: ${unit} → ${unit === 'kg' ? 'lb' : 'kg'}`,
            icon: ArrowLeftRight,
            onSelect: () => actions.switchUnit(entryId, unit === 'kg' ? 'lb' : 'kg'),
          },
        ]
      : []),
    { label: 'Move up', icon: ArrowUp, isDisabled: index === 0, onSelect: () => actions.move(entryId, -1) },
    { label: 'Move down', icon: ArrowDown, isDisabled: index === count - 1, onSelect: () => actions.move(entryId, 1) },
    { label: 'Remove exercise', icon: Trash2, isDestructive: true, onSelect: () => actions.requestRemoval(entry) },
  ];
}
