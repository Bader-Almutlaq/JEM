import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { followPointer } from './followPointer';

// Node has no DOM: a bare EventTarget stands in for the window, and events carry a pointerId like PointerEvents.
beforeEach(() => vi.stubGlobal('window', new EventTarget()));
afterEach(() => vi.unstubAllGlobals());

function pointer(type: string, pointerId: number): Event {
  return Object.assign(new Event(type, { cancelable: true }), { pointerId });
}

test('reports moves of the followed pointer only, then its end once, and stops', () => {
  const onMove = vi.fn();
  const onEnd = vi.fn();
  followPointer(1, { onMove, onEnd });
  window.dispatchEvent(pointer('pointermove', 2));
  window.dispatchEvent(pointer('pointermove', 1));
  window.dispatchEvent(pointer('pointerup', 2));
  window.dispatchEvent(pointer('pointercancel', 1));
  window.dispatchEvent(pointer('pointermove', 1));
  window.dispatchEvent(pointer('pointerup', 1));
  expect(onMove).toHaveBeenCalledTimes(1);
  expect(onEnd).toHaveBeenCalledTimes(1);
});

test('stop removes every listener and is safe to call twice', () => {
  const onMove = vi.fn();
  const onEnd = vi.fn();
  const stop = followPointer(1, { onMove, onEnd });
  stop();
  stop();
  window.dispatchEvent(pointer('pointermove', 1));
  window.dispatchEvent(pointer('pointerup', 1));
  expect(onMove).not.toHaveBeenCalled();
  expect(onEnd).not.toHaveBeenCalled();
});

test('touch scrolling is held off only while blocksScroll says so, and never without it', () => {
  let isDragging = false;
  const stop = followPointer(1, { blocksScroll: () => isDragging });
  const early = new Event('touchmove', { cancelable: true });
  window.dispatchEvent(early);
  isDragging = true;
  const late = new Event('touchmove', { cancelable: true });
  window.dispatchEvent(late);
  expect([early.defaultPrevented, late.defaultPrevented]).toEqual([false, true]);
  stop();

  followPointer(1, {});
  const free = new Event('touchmove', { cancelable: true });
  window.dispatchEvent(free);
  expect(free.defaultPrevented).toBe(false);
});
