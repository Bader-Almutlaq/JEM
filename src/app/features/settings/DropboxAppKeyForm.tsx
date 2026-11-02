import { useState } from 'react';
import { dropboxBackup } from '../../data/dropbox/cloudBackup';
import { CopyButton } from './CopyButton';
import styles from './DropboxBackupSection.module.css';

/** The three scopes the backup needs; the same list is in docs/DECISIONS.md. */
const DropboxPermissions = ['files.metadata.read', 'files.content.write', 'files.content.read'] as const;

/** Advanced device-specific Dropbox app setup, always collapsed until requested. */
export function DropboxAppKeyForm({
  disabled,
  message,
  invalid,
  customAppKey,
  canReset,
}: {
  readonly disabled: boolean;
  readonly message: string | undefined;
  readonly invalid: boolean;
  /** The key saved on this phone, or `undefined` while the built-in app is used. */
  readonly customAppKey: string | undefined;
  /** Whether Dropbox has anything on this phone to forget: a connection, a half-done one, or a saved key. */
  readonly canReset: boolean;
}) {
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
                <span className={styles.redirectUri}>{permission}</span>
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
      {canReset && (
        <div className={styles.keyForm}>
          <p>
            Reset forgets the Dropbox connection and any app key saved on this phone, and goes back to JEM&apos;s
            built-in app. Your workouts and the files already in your Dropbox are not touched.
          </p>
          <button
            className={styles.finish}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (window.confirm('Reset Dropbox on this phone? Your workouts and Dropbox files are not touched.')) {
                void dropboxBackup.resetConnection();
              }
            }}
          >
            Reset Dropbox on this phone
          </button>
        </div>
      )}
    </details>
  );
}
