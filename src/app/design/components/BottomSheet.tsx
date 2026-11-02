import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import styles from './BottomSheet.module.css';
import { useAnimatedClose } from './useAnimatedClose';

/**
 * A panel that slides up from the bottom edge over the screen, drawn with the browser's `<dialog>`
 * so focus stays inside it and Escape closes it. Pressing outside it closes it too. It slides up in
 * about 240 ms and, when closed by Escape or an outside press, slides away in about 150 ms before
 * `onClose` runs (a parent that unmounts it directly skips the exit). Render it only while it is open. `children` is the body, which scrolls when it is long; put the actions after it.
 */
export function BottomSheet({
  title,
  onClose,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) element.showModal();
  }, []);

  const { isClosing, requestClose } = useAnimatedClose();

  const closeOnBackdropPress = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) requestClose(onClose);
  };

  return (
    <dialog
      ref={dialog}
      className={styles.sheet}
      data-closing={isClosing}
      onCancel={(event) => {
        event.preventDefault();
        requestClose(onClose);
      }}
      onClick={closeOnBackdropPress}
    >
      <div className={styles.content}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  );
}
