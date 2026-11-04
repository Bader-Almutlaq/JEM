import { createContext, useContext, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { database } from '../../data/database';
import { loggingQueue } from '../../features/workout/loggingQueue';
import { followPointer } from '../gestures/followPointer';
import { DragGesture } from './DragGesture';
import styles from './WorkoutDrag.module.css';

/** A draggable unfiled workout. */
export type DragItem = { readonly kind: 'template'; readonly id: number; readonly name: string };
/** The currently lifted item and its pointer position, or undefined while idle. */
export interface DragState {
  readonly item: DragItem;
  readonly x: number;
  readonly y: number;
  readonly target: number | undefined;
}
/** Heuristic: the requested confirmation duration, in milliseconds. */
export const DragLimits = Object.freeze({ confirmationMilliseconds: 3000 });
interface DragContextValue {
  readonly state: DragState | undefined;
  readonly message: string;
  readonly start: (event: PointerEvent, item: DragItem) => void;
  readonly consumeClick: () => boolean;
}
const Context = createContext<DragContextValue | undefined>(undefined);

/** Supplies the active pointer drag to source rows and plan targets. */
export function WorkoutDrag({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<DragState | undefined>();
  const [message, setMessage] = useState('');
  const cleanup = useRef<() => void>(() => {});
  const suppressClick = useRef(false);
  useEffect(() => () => cleanup.current(), []);
  useEffect(() => {
    if (message === '') return;
    const timer = setTimeout(() => setMessage(''), DragLimits.confirmationMilliseconds);
    return () => clearTimeout(timer);
  }, [message]);
  const start = (event: PointerEvent, item: DragItem) => {
    if (event.button !== 0) return;
    cleanup.current();
    suppressClick.current = false;
    const origin = { x: event.clientX, y: event.clientY };
    let current: DragState = { item, ...origin, target: undefined };
    const targetAt = (x: number, y: number): HTMLElement | null =>
      document.elementFromPoint(x, y)?.closest('[data-plan-id]') ?? null;
    const gesture = new DragGesture(origin.x, origin.y, () => {
      suppressClick.current = true;
      setState(current);
    });
    const move = (next: globalThis.PointerEvent) => {
      gesture.move(next.clientX, next.clientY);
      if (gesture.isDragging) {
        next.preventDefault();
        const target = targetAt(next.clientX, next.clientY);
        current = {
          item,
          x: next.clientX,
          y: next.clientY,
          target: target === null ? undefined : Number(target.dataset.planId),
        };
        setState(current);
      }
    };
    const end = (next: globalThis.PointerEvent) => {
      if (next.type === 'pointerup') {
        const target = targetAt(next.clientX, next.clientY);
        const planId = gesture.drop(target === null ? undefined : Number(target.dataset.planId));
        if (target !== null && planId !== undefined) {
          const planName = target.dataset.planName ?? '';
          void loggingQueue
            .enqueue(async () => {
              await database.moveTemplate(item.id, planId);
              return true;
            })
            .then((saved) => {
              if (saved === true) setMessage(`Added ${item.name} to ${planName}`);
            });
        }
      }
      cleanup.current();
    };
    const stop = followPointer(event.pointerId, { onMove: move, onEnd: end, blocksScroll: () => gesture.isDragging });
    cleanup.current = () => {
      gesture.cancel();
      stop();
      setState(undefined);
    };
  };
  const consumeClick = () => {
    const value = suppressClick.current;
    suppressClick.current = false;
    return value;
  };
  return (
    <Context.Provider value={{ state, message, start, consumeClick }}>
      {children}
      {state !== undefined && (
        <div className={styles.lifted} style={{ left: state.x, top: state.y }}>
          {state.item.name}
        </div>
      )}
    </Context.Provider>
  );
}
/** Accesses drag gestures within a WorkoutDrag provider. */
export function useWorkoutDrag(): DragContextValue | undefined {
  return useContext(Context);
}
