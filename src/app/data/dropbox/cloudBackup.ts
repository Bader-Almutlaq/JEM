import { log } from '../../../core/support/log';
import { database } from '../database';
import { restoreBackupBytes } from '../restoreBackupBytes';
import { DropboxApi } from './DropboxApi';
import { DropboxBackup } from './DropboxBackup';
import { effectiveDropboxAppKey } from './effectiveDropboxAppKey';
import { DropboxTokenStore } from './DropboxTokenStore';

const tokens = new DropboxTokenStore();
let appKey: string;
try {
  tokens.forgetRetiredAppKey();
  appKey = effectiveDropboxAppKey(tokens);
} catch {
  // Never use a possibly wrong client key with an existing token when storage is inaccessible.
  log.backup.error('The Dropbox app key could not be read on this phone. Check website storage.');
  appKey = '';
}

/** The one cloud coordinator, eagerly loaded with the workout/Settings routes, independent of mounted screens. */
export const dropboxBackup = new DropboxBackup(
  appKey,
  {
    isDatabaseEmpty: () => database.isDatabaseEmpty(),
    // A downloaded backup is never reused, so its bytes are moved to the worker rather than copied.
    restoreBackup: restoreBackupBytes,
    exportCloudBackup: () => database.exportCloudBackup(),
    cloudBackupSettings: () => database.cloudBackupSettings(),
    updateCloudBackupSettings: (change) => database.updateCloudBackupSettings(change),
  },
  tokens,
  new DropboxApi(appKey, tokens),
);

// Listen even without a key, so adding one during this session enables online retries.
window.addEventListener('online', () => void dropboxBackup.retryPending());
void dropboxBackup.initialize();
