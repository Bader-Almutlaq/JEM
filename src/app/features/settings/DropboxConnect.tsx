import { dropboxBackup } from '../../data/dropbox/cloudBackup';
import { useDropboxBackup } from '../../data/dropbox/useDropboxBackup';
import { DropboxCodeForm } from './DropboxCodeForm';
import styles from './DropboxBackupSection.module.css';

/**
 * The one way to connect Dropbox: open Dropbox in its own tab, tap Allow, copy the code it shows, paste it here.
 * (A redirect back into JEM cannot work for a Home Screen web app: Safari finishes the sign-in in its own storage.)
 */
export function DropboxConnect() {
  const state = useDropboxBackup();
  const busy = state.phase !== 'idle';
  const open = () => {
    void dropboxBackup.beginConnect(() => {
      // Open synchronously in the tap: awaiting SHA-256 first loses iOS Safari's user activation.
      const popup = window.open('about:blank', '_blank');
      if (popup === null) return null;
      popup.opener = null;
      return {
        navigate: (url) => {
          popup.location.href = url;
        },
        close: () => popup.close(),
      };
    });
  };
  return (
    <>
      <div className={styles.step}>
        <p>
          1. Open Dropbox, tap <strong>Allow</strong>, and copy the code it shows.
        </p>
        <button className={styles.finish} type="button" disabled={busy || !state.enabled} onClick={open}>
          Open Dropbox
        </button>
      </div>
      <DropboxCodeForm disabled={busy} awaitingCode={state.awaitingCode} message={state.codeMessage} />
    </>
  );
}
