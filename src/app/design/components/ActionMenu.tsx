import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './ActionMenu.module.css';
import { actionMenuPlacement } from './actionMenuPlacement';
import { ActionMenuRow, type ActionMenuItem } from './ActionMenuRow';

/**
 * A button that opens a short list of actions beside it, such as an exercise's "…" menu. Pressing
 * anywhere else closes it. `children` is the button's content; `label` is what screen readers say.
 * `align` is the edge of the button the list lines up with.
 */
export function ActionMenu({
  label,
  caption,
  items,
  align = 'end',
  children,
}: {
  readonly label: string;
  /** Optional muted context shown only inside the open menu. */
  readonly caption?: string | undefined;
  readonly items: readonly ActionMenuItem[];
  readonly align?: 'start' | 'end';
  readonly children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number } | undefined>(undefined);
  const close = () => setIsOpen(false);

  useLayoutEffect(() => {
    if (!isOpen || menu.current === null || panel.current === null) return;
    const trigger = menu.current.getBoundingClientRect();
    const bounds = panel.current.getBoundingClientRect();
    const pad = document.querySelector('[aria-label="Number pad"]')?.getBoundingClientRect();
    const bottom =
      pad?.top ??
      window.innerHeight -
        (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tab-bar-height')) || 0);
    const position = actionMenuPlacement(trigger, bounds, { width: window.innerWidth, bottom }, align);
    setPlacement(position);
  }, [isOpen, align]);

  // A press anywhere outside the menu closes it. (A full-screen backdrop can't be used: inside the
  // blurred top bar a fixed element is sized to the bar, not the screen.)
  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        (menu.current?.contains(event.target) === true || panel.current?.contains(event.target) === true)
      )
        return;
      setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [isOpen]);

  return (
    <div ref={menu} className={styles.menu}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => {
          setPlacement(undefined);
          setIsOpen(!isOpen);
        }}
      >
        {children}
      </button>
      {isOpen &&
        createPortal(
          <div
            ref={panel}
            className={styles.panel}
            role="menu"
            style={placement === undefined ? { visibility: 'hidden' } : { left: placement.left, top: placement.top }}
          >
            {caption !== undefined && <p className={styles.caption}>{caption}</p>}
            {items.map((item) => (
              <ActionMenuRow key={item.label} item={item} onChosen={close} />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
