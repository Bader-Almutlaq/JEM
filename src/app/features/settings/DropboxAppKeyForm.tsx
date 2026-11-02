import { useState } from 'react';
import { dropboxBackup, dropboxRedirectUri } from '../../data/dropbox/cloudBackup';
import styles from './DropboxBackupSection.module.css';

/** Advanced device-specific Dropbox app setup, always collapsed until requested. */
export function DropboxAppKeyForm({
  disabled,
  message,
  invalid,
}: {
  readonly disabled: boolean;
  readonly message: string | undefined;
  readonly invalid: boolean;
}) {
  const [key, setKey] = useState('');
  return (
    <details className={styles.codeForm}>
      <summary>Advanced: use your own Dropbox app</summary>
      <p>JEM already includes a Dropbox app key. You only need this to use an app you created yourself.</p>
      <p>
        If Dropbox shows an app disabled or invalid app key page: This Dropbox app is switched off. Create a new one in
        Advanced, or update JEM.
      </p>
      <p>
        Create an app at <a href="https://www.dropbox.com/developers/apps">dropbox.com/developers/apps</a> with Scoped
        access and App folder. Enable files.metadata.read, files.content.write and files.content.read, then copy the App
        key. Saving a different key disconnects the current app; connect again afterwards.
      </p>
      <p>
        Add this redirect URI in your app's settings: <span className={styles.redirectUri}>{dropboxRedirectUri}</span>
      </p>
      <form
        className={styles.keyForm}
        onSubmit={(event) => {
          event.preventDefault();
          void dropboxBackup.saveAppKey(key);
        }}
      >
        <label htmlFor="dropbox-app-key">App key (leave blank to use the default)</label>
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
    </details>
  );
}
