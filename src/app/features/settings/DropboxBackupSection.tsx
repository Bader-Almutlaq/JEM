import { dropboxBackup } from '../../data/dropbox/cloudBackup';
import { dropboxCaption, dropboxStatusTone } from '../../data/dropbox/dropboxCaption';
import { useDropboxBackup } from '../../data/dropbox/useDropboxBackup';
import { Section } from '../../design/components/Section';
import { DropboxAppKeyForm } from './DropboxAppKeyForm';
import { DropboxConnect } from './DropboxConnect';
import { DropboxRestoreSheet } from './DropboxRestoreSheet';
import styles from './DropboxBackupSection.module.css';

/** Optional automatic backups and device-specific app key setup. */
export function DropboxBackupSection() {
  const state = useDropboxBackup();
  const busy = state.phase !== 'idle';
  const tone = dropboxStatusTone(state);
  return (
    <>
      <Section
        label="Dropbox"
        footnote="Automatic full backups go only to this app’s folder in your Dropbox. Disconnect never deletes your files."
      >
        <p className={styles.caption} data-status={tone} role={tone === 'bad' ? 'alert' : 'status'}>
          {tone === 'good' && <span aria-hidden="true">✓ </span>}
          {tone === 'bad' && <span aria-hidden="true">! </span>}
          {dropboxCaption(state, new Date())}
        </p>
        {state.notice !== undefined && (
          <p className={styles.caption} role="status">
            {state.notice}
          </p>
        )}
        {state.enabled &&
          (state.connected ? (
            <>
              <button
                className={styles.action}
                type="button"
                disabled={busy}
                onClick={() => void dropboxBackup.backUp()}
              >
                Back up to Dropbox now
              </button>
              <button
                className={styles.action}
                type="button"
                disabled={busy}
                onClick={() => void dropboxBackup.openRestore()}
              >
                Restore from Dropbox…
              </button>
              <button
                className={styles.action}
                type="button"
                disabled={busy}
                onClick={() => void dropboxBackup.disconnect()}
              >
                Disconnect
              </button>
            </>
          ) : (
            <DropboxConnect />
          ))}
        <DropboxAppKeyForm
          disabled={busy}
          message={state.appKeyMessage}
          invalid={state.appKeyInvalid ?? false}
          customAppKey={state.customAppKey}
          canReset={state.connected || state.awaitingCode || state.reconnect || state.customAppKey !== undefined}
        />
      </Section>
      <DropboxRestoreSheet />
    </>
  );
}
