import { log } from '../../../core/support/log';
import { database } from '../database';
import { DropboxApi } from './DropboxApi';
import { DropboxBackup } from './DropboxBackup';
import { effectiveDropboxAppKey } from './effectiveDropboxAppKey';
import { DropboxTokenStore } from './DropboxTokenStore';

const tokens = new DropboxTokenStore();
let appKey: string;
try {
  appKey = effectiveDropboxAppKey(tokens);
} catch {
  // Never use a possibly wrong client key with an existing token when storage is inaccessible.
  log.backup.error('The Dropbox app key could not be read on this phone. Check website storage.');
  appKey = '';
}

/** The one cloud coordinator, eagerly loaded with the workout/Settings routes, independent of mounted screens. */
export const dropboxBackup = new DropboxBackup(appKey, database, tokens, new DropboxApi(appKey, tokens));

// Listen even without a key, so adding one during this session enables online retries.
window.addEventListener('online', () => void dropboxBackup.retryPending());
void dropboxBackup.initialize();
