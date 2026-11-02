import { useState } from 'react';
import { parseBackupFileName } from '../../../core/backup/BackupFile';
import type { CloudBackupFile } from '../../../core/backup/CloudRetention';
import { dropboxBackup } from '../../data/dropbox/cloudBackup';
import { dropboxCaption } from '../../data/dropbox/dropboxCaption';
import { useDropboxBackup } from '../../data/dropbox/useDropboxBackup';
import { BottomSheet } from '../../design/components/BottomSheet';
import { Button } from '../../design/components/Button';
import { RestoreBackupConfirmation } from './RestoreBackupConfirmation';
import styles from './DropboxRestoreSheet.module.css';

/** Heuristic: show 30 choices per tap to keep years of retained monthly backups easy to browse. Sizes use decimal kB/MB. */
const RestoreList = { pageSize: 30, bytesPerKilobyte: 1000, bytesPerMegabyte: 1_000_000 } as const;

/** A backup's size in decimal kB below a megabyte, MB above, to one decimal place. */
function fileSizeText(bytes: number): string {
  const isMegabytes = bytes >= RestoreList.bytesPerMegabyte;
  const amount = bytes / (isMegabytes ? RestoreList.bytesPerMegabyte : RestoreList.bytesPerKilobyte);
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${isMegabytes ? 'MB' : 'kB'}`;
}

/** Dropbox restore discovery; rendering or selecting a row never downloads until the owner confirms replacement. */
export function DropboxRestoreSheet() {
  const state = useDropboxBackup();
  const [visible, setVisible] = useState<number>(RestoreList.pageSize);
  const [picked, setPicked] = useState<CloudBackupFile>();
  const busy = state.phase !== 'idle';
  const restoring = state.phase === 'downloading' || state.phase === 'restoring';
  if (!state.restoreOpen) return null;

  const close = () => {
    dropboxBackup.closeRestore();
    setPicked(undefined);
    setVisible(RestoreList.pageSize);
  };

  return (
    <>
      <BottomSheet title="Restore from Dropbox" onClose={close}>
        <div className={styles.content}>
          {(state.phase === 'listing' || restoring) && <p role="status">{dropboxCaption(state, new Date())}</p>}
          {state.notice !== undefined && (
            <p className={styles.message} role="status">
              {state.notice}
            </p>
          )}
          {state.message !== undefined && (
            <>
              <p className={styles.message} role="alert">
                {state.message}
              </p>
              <Button isDisabled={busy || !state.connected} onPress={() => void dropboxBackup.openRestore()}>
                Try again
              </Button>
            </>
          )}
          {state.backups?.length === 0 && (
            <p className={styles.message}>No backups found in this Dropbox app folder.</p>
          )}
          {!restoring &&
            state.backups?.slice(0, visible).map((file) => (
              <button
                key={file.path}
                className={styles.action}
                type="button"
                disabled={busy || !state.connected}
                onClick={() => setPicked(file)}
              >
                <span>{parseBackupFileName(file.name)?.toLocaleString()}</span>
                <span className={styles.size}>{fileSizeText(file.size)}</span>
              </button>
            ))}
          {!restoring && (state.backups?.length ?? 0) > visible && (
            <Button isDisabled={busy} onPress={() => setVisible((count) => count + RestoreList.pageSize)}>
              Show older
            </Button>
          )}
          <Button onPress={close}>Close</Button>
        </div>
      </BottomSheet>
      {picked !== undefined && (
        <RestoreBackupConfirmation
          detail={parseBackupFileName(picked.name)?.toLocaleString() ?? picked.name}
          onCancel={() => setPicked(undefined)}
          onConfirm={() => {
            const path = picked.path;
            setPicked(undefined);
            void dropboxBackup.restore(path);
          }}
        />
      )}
    </>
  );
}
