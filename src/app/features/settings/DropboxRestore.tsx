import { useState } from 'react';
import type { CloudBackupFile } from '../../../core/backup/CloudRetention';
import { dropboxBackup } from '../../data/dropbox/cloudBackup';
import { useDropboxBackup } from '../../data/dropbox/useDropboxBackup';
import { RestoreConfirmDialog } from './RestoreConfirmDialog';
import styles from './DropboxBackupSection.module.css';

const BYTES_PER_MEGABYTE = 1024 * 1024;

/** Restore from a backup stored in the connected Dropbox: list, choose, confirm. */
export function DropboxRestore() {
  const state = useDropboxBackup();
  const [chosen, setChosen] = useState<CloudBackupFile | undefined>();
  const busy = state.phase !== 'idle';
  return (
    <>
      <button className={styles.action} type="button" disabled={busy} onClick={() => void dropboxBackup.loadBackups()}>
        Restore from Dropbox…
      </button>
      {state.backups?.length === 0 && <p className={styles.caption}>No JEM backups were found in your Dropbox.</p>}
      {state.backups !== undefined && state.backups.length > 0 && (
        <ul className={styles.backupList} aria-label="Backups in Dropbox, newest first">
          {state.backups.map((file) => (
            <li key={file.path}>
              <button className={styles.action} type="button" disabled={busy} onClick={() => setChosen(file)}>
                {describeBackup(file)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <RestoreConfirmDialog
        description={chosen === undefined ? undefined : describeBackup(chosen)}
        onCancel={() => setChosen(undefined)}
        onConfirm={() => {
          if (chosen === undefined) return;
          setChosen(undefined);
          void dropboxBackup.restoreFromDropbox(chosen.path);
        }}
      />
    </>
  );
}

/** "31 Oct 2026, 14:05 · 2.4 MB" in the phone's locale; the size is left out when Dropbox did not report one. */
function describeBackup(file: CloudBackupFile): string {
  const time = new Date(file.serverTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return file.sizeBytes === undefined ? time : `${time} · ${(file.sizeBytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`;
}
