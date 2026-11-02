import { useState } from 'react';
import { dropboxBackup, dropboxRedirectUri } from '../../data/dropbox/cloudBackup';
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
}: {
  readonly disabled: boolean;
  readonly message: string | undefined;
  readonly invalid: boolean;
  /** The key saved on this phone, or `undefined` while the built-in app is used. */
  readonly customAppKey: string | undefined;
}) {
  const [key, setKey] = useState('');
  return (
    <details className={styles.codeForm}>
      <summary>Advanced: use a different Dropbox app</summary>
      <p role="status">
        Connecting through:{' '}
        <strong>
          {customAppKey === undefined
            ? "JEM's built-in Dropbox app"
            : `your own app (key ends …${customAppKey.slice(-4)})`}
        </strong>
        .
      </p>
      {customAppKey !== undefined && (
        <button
          className={styles.finish}
          type="button"
          disabled={disabled}
          onClick={() => void dropboxBackup.saveAppKey('')}
        >
          Use JEM&apos;s built-in app instead
        </button>
      )}
      <p>
        The built-in app is the normal way: tap Open Dropbox and your backups go to a folder in your own Dropbox. A
        different app only matters if Dropbox says the built-in one is switched off or limited (it allows about 50
        people). Then you create one for yourself, and your backups still go to your own Dropbox:
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
          On the <strong>Settings</strong> tab, under <strong>Redirect URIs</strong>, add this link:
          <div className={styles.copyList}>
            <span className={styles.redirectUri}>{dropboxRedirectUri}</span>
            <CopyButton text={dropboxRedirectUri} label="the redirect link" />
          </div>
        </li>
        <li>
          Copy the <strong>App key</strong> from the Settings tab, paste it below, and tap Save. Saving a different key
          disconnects the current app; connect again afterwards.
        </li>
      </ol>
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
