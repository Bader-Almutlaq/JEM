import { isValidElement, type ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { Button } from '../../design/components/Button';
import { RepRangeDialog } from './RepRangeDialog';

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => [initial, vi.fn()],
}));

test('Targets saves the displayed ranges and names the linked workout', () => {
  const save = vi.fn();
  const sheet = RepRangeDialog({
    target: { kind: 'working', targetRepsLow: 6, targetRepsHigh: 10, targetRpe: 8, targetRpeHigh: 9 },
    restLow: 120,
    restHigh: 180,
    workoutName: 'Push',
    onSave: save,
    onCancel: vi.fn(),
  });
  const children: ReactNode = sheet.props.children;
  if (!Array.isArray(children)) throw new Error('Missing sheet contents');
  const button = children.find((child: unknown) => isValidElement(child) && child.type === Button);
  if (!isValidElement<{ onPress: () => void }>(button)) throw new Error('Missing save button');
  button.props.onPress();
  expect(save).toHaveBeenCalledWith({
    targetRepsLow: 6,
    targetRepsHigh: 10,
    targetRpe: 8,
    targetRpeHigh: 9,
    restRange: { low: 120, high: 180 },
  });
});
