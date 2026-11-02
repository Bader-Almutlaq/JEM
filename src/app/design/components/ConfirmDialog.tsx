import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';
import styles from './ConfirmDialog.module.css';
import { useAnimatedClose } from './useAnimatedClose';

/**
 * A modal question with a confirm and a cancel button, drawn with the browser's `<dialog>` so focus
 * stays inside it and the Escape key cancels. It fades and scales in over about 200 ms; Escape and the
 * secondary button play a ~150 ms exit before running (the confirm action is never delayed).
 * Render it only while the question is open.
 * `cancelLabel` renames the second button ("Cancel" by default) when the safe answer has another name.
 */
export function ConfirmDialog({
  title,
  confirmLabel,
  cancelLabel = 'Cancel',
  isBusy = false,
  onConfirm,
  onCancel,
  onDismiss,
  children,
  submitOnReturn = false,
  isConfirmDisabled = false,
}: {
  readonly title: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly isBusy?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** Escape action when different from the secondary button. */
  readonly onDismiss?: () => void;
  readonly children?: ReactNode;
  /** Submit the primary action from a single-line input. */
  readonly submitOnReturn?: boolean;
  /** Disable confirmation while the input is invalid. */
  readonly isConfirmDisabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) element.showModal();
  }, []);

  const { isClosing, requestClose } = useAnimatedClose();

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      data-closing={isClosing}
      onCancel={(event) => {
        event.preventDefault();
        requestClose(onDismiss ?? onCancel);
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!isBusy && !isConfirmDisabled) onConfirm();
        }}
      >
        <h2 className={styles.title}>{title}</h2>
        {children !== undefined && <div className={styles.body}>{children}</div>}
        <div className={styles.actions}>
          <Button
            variant="primary"
            type={submitOnReturn ? 'submit' : 'button'}
            isDisabled={isBusy || isConfirmDisabled}
            onPress={submitOnReturn ? () => undefined : onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button isDisabled={isBusy} onPress={() => requestClose(onCancel)}>
            {cancelLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
