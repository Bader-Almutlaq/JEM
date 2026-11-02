import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { TimeChartDomain, TimeChartProps } from './TimeChart.types';
import { initialChartDomain } from './timeChartMath';
import { TimeChartCanvas } from './TimeChartCanvas';
import { TablePill } from './TablePill';
import styles from './TimeChart.module.css';

/** Modal landscape history canvas; rotates clockwise on upright phones and restores focus/page scroll on close. */
export function TimeChartExpanded({
  props,
  history,
  onClose,
}: {
  readonly props: TimeChartProps;
  readonly history: TimeChartDomain;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [domain, setDomain] = useState(() => initialChartDomain(history));
  const [table, setTable] = useState(false);
  const [rotated, setRotated] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(orientation: portrait)').matches,
  );
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    const orientation = window.matchMedia('(orientation: portrait)');
    const update = () => setRotated(orientation.matches);
    orientation.addEventListener('change', update);
    return () => {
      orientation.removeEventListener('change', update);
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);
  const content = (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label={`${props.title} full screen`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className={`${styles.expanded} ${styles.chart}`}>
        <TimeChartCanvas
          props={props}
          history={history}
          domain={domain}
          expanded
          rotated={rotated}
          onDomain={setDomain}
          table={table}
          controls={
            <>
              <TablePill shown={table} onToggle={() => setTable(!table)} />
              <button className={styles.icon} type="button" aria-label="Close chart" onClick={onClose}>
                <X size={20} aria-hidden />
              </button>
            </>
          }
        />
      </div>
    </dialog>
  );
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
