import { expect, test, vi } from 'vitest';
import { ChangeCoalescer } from './ChangeCoalescer';

function manualScheduler() {
  const pending: (() => void)[] = [];
  return {
    schedule: (flush: () => void) => {
      pending.push(flush);
    },
    runAll: () => pending.splice(0).forEach((flush) => flush()),
    get size() {
      return pending.length;
    },
  };
}

test('a burst of changes becomes one flush with the newest version', () => {
  const scheduler = manualScheduler();
  const onFlush = vi.fn();
  const coalescer = new ChangeCoalescer(scheduler.schedule, onFlush);
  coalescer.notify(1);
  coalescer.notify(3);
  coalescer.notify(2);
  expect(scheduler.size).toBe(1);
  expect(onFlush).not.toHaveBeenCalled();
  scheduler.runAll();
  expect(onFlush.mock.calls).toEqual([[3]]);
});

test('a change after a flush schedules the next one', () => {
  const scheduler = manualScheduler();
  const onFlush = vi.fn();
  const coalescer = new ChangeCoalescer(scheduler.schedule, onFlush);
  coalescer.notify(1);
  scheduler.runAll();
  coalescer.notify(2);
  expect(scheduler.size).toBe(1);
  scheduler.runAll();
  expect(onFlush.mock.calls).toEqual([[1], [2]]);
});
