import { useEffect, useRef, useState } from 'react';
import { dropboxBackup, dropboxRedirectUri, returnedFromDropbox } from '../../data/dropbox/cloudBackup';
import { dropboxCaption, dropboxStatusTone } from '../../data/dropbox/dropboxCaption';
import { useDropboxBackup } from '../../data/dropbox/useDropboxBackup';
import { Section } from '../../design/components/Section';
import { DropboxAppKeyForm } from './DropboxAppKeyForm';
import { DropboxCodeForm } from './DropboxCodeForm';
import { DropboxRestoreSheet } from './DropboxRestoreSheet';
import styles from './DropboxBackupSection.module.css';

/** Optional automatic backups and device-specific app key setup. */
export function DropboxBackupSection() {
  const state = useDropboxBackup();
  const [pasteCode, setPasteCode] = useState(false);
  const fallback = pasteCode || state.awaitingCode || state.codeMessage !== undefined;
  const busy = state.phase !== 'idle';
  const tone = dropboxStatusTone(state);
  const status = useRef<HTMLParagraphElement>(null);
  // Coming back from Dropbox lands at the top of Settings; bring the connection result into view.
  useEffect(() => {
    if (returnedFromDropbox) status.current?.scrollIntoView({ block: 'center' });
  }, []);
  const connect = () => {
    if (!fallback) {
      void dropboxBackup.beginRedirectConnect(dropboxRedirectUri, (url) => window.location.assign(url));
      return;
    }
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
      <Section
        label="Dropbox"
        footnote="Automatic full backups go only to this app’s folder in your Dropbox. Disconnect never deletes your files."
      >
        <p ref={status} className={styles.caption} data-status={tone} role={tone === 'bad' ? 'alert' : 'status'}>
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
            <>
              <div className={styles.step}>
                <p>
                  1. Open Dropbox and tap <strong>Allow</strong>.{!fallback && " You'll come straight back here."}
                </p>
                <button className={styles.finish} type="button" disabled={busy} onClick={connect}>
                  Open Dropbox
                </button>
                {!fallback && (
                  <button className={styles.fallback} type="button" disabled={busy} onClick={() => setPasteCode(true)}>
                    Paste a code instead
                  </button>
                )}
              </div>
              {fallback && (
                <DropboxCodeForm disabled={busy} awaitingCode={state.awaitingCode} message={state.codeMessage} />
              )}
            </>
          ))}
        <DropboxAppKeyForm
          disabled={busy}
          message={state.appKeyMessage}
          invalid={state.appKeyInvalid ?? false}
          customAppKey={state.customAppKey}
        />
      </Section>
      <DropboxRestoreSheet />
    </>
  );
}
