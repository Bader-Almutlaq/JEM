import { useEffect, useRef } from 'react';
import styles from './BackupSection.module.css';

/**
 * The one confirmation before a backup replaces the data on this phone, shared by every restore source.
 * Open while `description` is set; `description` names the backup (file, date, size) so the owner knows
 * which one they are about to restore.
 */
export function RestoreConfirmDialog({
  description,
  onCancel,
  onConfirm,
}: {
  readonly description: string | undefined;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (description !== undefined && !dialog.open) dialog.showModal();
    if (description === undefined && dialog.open) dialog.close();
  }, [description]);

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onCancel} aria-labelledby="restore-title">
      <h2 id="restore-title" className={styles.dialogTitle}>
        Restore this backup?
      </h2>
      <p className={styles.dialogText}>
        Replace all current data with this backup? Your current data is kept as a safety snapshot on this phone first.
      </p>
      {description !== undefined && <p className={styles.dialogFile}>{description}</p>}
      <div className={styles.dialogButtons}>
        <button type="button" className={styles.dialogButton} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={`${styles.dialogButton} ${styles.destructive}`} onClick={onConfirm}>
          Replace data
        </button>
      </div>
    </dialog>
  );
}
