import type { DropboxBackupState } from './DropboxBackup';

/** Heuristic: whole-minute/hour/day age labels keep the connection caption compact; future times count as just now. */
const CaptionTime = { minute: 60_000, hour: 3_600_000, day: 86_400_000 } as const;

function backupAge(timestamp: string | undefined, now: Date): string {
  const time = timestamp === undefined ? NaN : Date.parse(timestamp);
  if (!Number.isFinite(time)) return 'no backup yet';
  const elapsed = Math.max(0, now.getTime() - time);
  if (elapsed < CaptionTime.minute) return 'last backup just now';
  if (elapsed < CaptionTime.hour) return `last backup ${Math.floor(elapsed / CaptionTime.minute)} min ago`;
  if (elapsed < CaptionTime.day) return `last backup ${Math.floor(elapsed / CaptionTime.hour)} hr ago`;
  const days = Math.floor(elapsed / CaptionTime.day);
  return `last backup ${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** Owner-facing status shared verbatim by Settings and the finish summary; current problems take priority. */
export function dropboxCaption(state: DropboxBackupState, now: Date): string {
  if (state.phase === 'backingUp') return 'Backing up…';
  if (state.phase === 'listing') return 'Loading backups…';
  if (state.phase === 'downloading') return 'Downloading…';
  if (state.phase === 'restoring') return 'Restoring…';
  if (state.phase === 'authorizing') return 'Connecting…';
  if (state.phase === 'disconnecting') return 'Disconnecting…';
  if (state.phase === 'loading') return 'Checking Dropbox…';
  if (state.message !== undefined) return state.message;
  if (state.reconnect) return 'Reconnect Dropbox to continue automatic backups.';
  if (!state.connected) return 'Not connected';
  return `Connected · ${backupAge(state.lastBackupAt, now)}`;
}

/** Semantic status for the existing status tokens; busy rows stay neutral even after an earlier failure. */
export function dropboxStatusTone(state: DropboxBackupState): 'neutral' | 'good' | 'bad' {
  if (state.phase !== 'idle') return 'neutral';
  if (state.message !== undefined || state.reconnect) return 'bad';
  return state.connected ? 'good' : 'neutral';
}
