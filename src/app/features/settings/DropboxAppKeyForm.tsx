import { useState } from 'react';
import { dropboxBackup } from '../../data/dropbox/cloudBackup';
import { DropboxPermissions } from '../../data/dropbox/pkce';
import { useDropboxBackup } from '../../data/dropbox/useDropboxBackup';
import { ConfirmDialog } from '../../design/components/ConfirmDialog';
import { CopyButton } from './CopyButton';
import styles from './DropboxBackupSection.module.css';

/** Advanced device-specific Dropbox app setup, always collapsed until requested. Reads the Dropbox state itself. */
export function DropboxAppKeyForm() {
  const state = useDropboxBackup();
  const disabled = state.phase !== 'idle';
  const message = state.appKeyMessage;
  const invalid = state.appKeyInvalid ?? false;
  /** The key saved on this phone, or `undefined` while the built-in app is used. */
  const customAppKey = state.customAppKey;
  // Reset is offered when Dropbox has anything on this phone to forget: a connection (working or needing a
  // reconnect), a half-done one, or a saved key.
  const canReset = state.connected || state.awaitingCode || state.reconnect || customAppKey !== undefined;
  const [key, setKey] = useState('');
  return (
    <details className={styles.codeForm}>
      <summary>Dropbox app and reset</summary>
      <p role="status">
        Connecting through:{' '}
        <strong>
          {customAppKey === undefined
            ? "JEM's built-in Dropbox app"
            : `your own app (key ends …${customAppKey.slice(-4)})`}
        </strong>
        .
      </p>
      <p>
        Backups go to a folder in <em>your</em> Dropbox either way. The built-in app is JEM&apos;s own Dropbox app. If
        Dropbox says it is switched off, or it has no permission to read files, use an app of your own:
      </p>
      <ol className={styles.checklist}>
        <li>
          Open <a href="https://www.dropbox.com/developers/apps">dropbox.com/developers/apps</a>, tap{' '}
          <strong>Create app</strong>, choose <strong>Scoped access</strong>, then <strong>App folder</strong>, and name
          it.
        </li>
        <li>
          On the <strong>Permissions</strong> tab, tick these three, then tap <strong>Submit</strong>:
          <ul className={styles.copyList}>
            {DropboxPermissions.map((permission) => (
              <li key={permission}>
                <span className={styles.permission}>{permission}</span>
                <CopyButton text={permission} label={permission} />
              </li>
            ))}
          </ul>
        </li>
        <li>
          Copy the <strong>App key</strong> from the Settings tab and paste it below. Then connect as above (open
          Dropbox, copy the code, paste it). No redirect link is needed.
        </li>
      </ol>
      <form
        className={styles.keyForm}
        onSubmit={(event) => {
          event.preventDefault();
          void dropboxBackup.saveAppKey(key);
        }}
      >
        <label htmlFor="dropbox-app-key">App key (leave blank for the built-in app)</label>
        <input
          id="dropbox-app-key"
          className={styles.codeInput}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={disabled}
          aria-describedby={message === undefined ? undefined : 'dropbox-key-message'}
          aria-invalid={invalid}
        />
        <button className={styles.finish} type="submit" disabled={disabled}>
          Save
        </button>
        {message !== undefined && (
          <p
            id="dropbox-key-message"
            className={invalid ? styles.error : undefined}
            role={invalid ? 'alert' : 'status'}
          >
            {message}
          </p>
        )}
      </form>
      {canReset && <DropboxReset disabled={disabled} />}
    </details>
  );
}

/** The way out of a stuck key or a dead app; asks first because it forgets the connection on this phone. */
function DropboxReset({ disabled }: { readonly disabled: boolean }) {
  const [isAsking, setIsAsking] = useState(false);
  return (
    <div className={styles.keyForm}>
      <p>
        Reset forgets the Dropbox connection and any app key saved on this phone, and goes back to JEM&apos;s built-in
        app. Your workouts and the files already in your Dropbox are not touched.
      </p>
      <button className={styles.finish} type="button" disabled={disabled} onClick={() => setIsAsking(true)}>
        Reset Dropbox on this phone
      </button>
      {isAsking && (
        <ConfirmDialog
          title="Reset Dropbox on this phone?"
          confirmLabel="Reset"
          onConfirm={() => {
            setIsAsking(false);
            void dropboxBackup.resetConnection();
          }}
          onCancel={() => setIsAsking(false)}
        >
          <p>Your workouts and the files in your Dropbox are not touched.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
