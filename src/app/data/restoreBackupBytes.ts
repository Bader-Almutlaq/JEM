import * as Comlink from 'comlink';
import type { RestoreResult } from '../../worker/WorkerApi';
import { database } from './database';

/**
 * Restores a backup file's bytes, moving them to the worker instead of copying them: a backup can be up to
 * 150 MB, and a copy would be made on the main thread. Afterwards `bytes` is empty and unusable, so callers
 * must not keep them for a retry (a retry reads the file or downloads it again).
 */
export function restoreBackupBytes(bytes: Uint8Array): Promise<RestoreResult> {
  return database.restoreBackup(Comlink.transfer(bytes, [bytes.buffer]));
}
