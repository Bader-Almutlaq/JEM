import { useRef, useState, type ChangeEvent } from 'react';
import { log } from '../../../core/support/log';
import { parseBackupFileName } from '../../../core/backup/BackupFile';
import { messageOf } from '../../data/database';
import { restoreBackupBytes } from '../../data/restoreBackupBytes';
import { readPickedFiles } from '../../data/readPickedFiles';
import { restoreBackupNotice } from '../../data/dropbox/restoreBackupNotice';
import { RestoreBackupConfirmation } from './RestoreBackupConfirmation';
import styles from './DropboxRestoreSheet.module.css';

interface PickedBackup {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** The shared iOS-safe file picker, replacement confirmation, and existing worker restore for Settings and a fresh phone. */
export function RestoreFileSheet({
  label = 'Restore from a file',
  className,
  onOpen,
  showAction = true,
}: {
  readonly label?: string;
  readonly className?: string;
  readonly onOpen?: () => void;
  /** Hide the entry point after a fresh phone gains data, while retaining its restore result. */
  readonly showAction?: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<PickedBackup>();
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState<{ readonly text: string; readonly failed: boolean }>();

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    setNotice(undefined);
    try {
      const [first] = await readPickedFiles(event.currentTarget, async (file) => ({
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      }));
      setPicked(first);
    } catch (error) {
      log.backup.error('The selected backup could not be read', error);
      setNotice({ text: `That file could not be read: ${messageOf(error)}`, failed: true });
    }
  };

  const restore = async () => {
    if (picked === undefined) return;
    const { bytes } = picked;
    setPicked(undefined);
    setRestoring(true);
    try {
      const result = await restoreBackupBytes(bytes);
      setNotice({ text: restoreBackupNotice(result.workoutCount), failed: false });
    } catch (error) {
      log.backup.error('The selected backup could not be restored', error);
      setNotice({ text: messageOf(error), failed: true });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      {showAction && (
        <button
          type="button"
          className={className ?? styles.action}
          disabled={restoring}
          onClick={() => {
            onOpen?.();
            picker.current?.click();
          }}
        >
          {restoring ? 'Restoring…' : label}
        </button>
      )}
      <input ref={picker} type="file" accept=".sqlite" hidden onChange={(event) => void pick(event)} />
      {notice !== undefined && (
        <p className={styles.message} role={notice.failed ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}
      {picked !== undefined && (
        <RestoreBackupConfirmation
          detail={parseBackupFileName(picked.name)?.toLocaleString() ?? picked.name}
          onConfirm={() => void restore()}
          onCancel={() => setPicked(undefined)}
        />
      )}
    </>
  );
}
