import { daysSinceBackup } from '../../../core/backup/BackupAge';
import { database, useDatabaseQuery } from '../../data/database';
import { Section, SectionRow } from '../../design/components/Section';
import styles from './BackupSection.module.css';
import { useBackupFile } from './useBackupFile';
import { DropboxBackupSection } from './DropboxBackupSection';
import { RestoreFileSheet } from './RestoreFileSheet';

/**
 * Back up and restore, in Settings.
 *
 * **Why the file is prepared before the tap:** iOS Safari only opens the share sheet from inside the tap
 * itself, and its "user gesture" is gone after the first `await` on a slow call. The worker therefore
 * builds the backup file as soon as this section shows (and again after every change), and the tap
 * handler calls `navigator.share` with no `await` before it.
 */
export function BackupSection() {
  const lastBackupAt = useDatabaseQuery('last-backup', () => database.lastBackupAt());
  const { file: backupFile, notice: backupNotice, backUp, clearNotice } = useBackupFile();
  return (
    <>
      <Section
        label="Backup"
        footnote="As an alternative to Dropbox, Back up now saves a copy of everything to Files; choose the same iCloud Drive folder each time. Restore replaces what is on this phone."
      >
        <SectionRow label="Last backup" value={describeLastBackup(lastBackupAt)} />
        <button type="button" className={styles.action} disabled={backupFile.status !== 'ready'} onClick={backUp}>
          {backupFile.status === 'loading' ? 'Preparing…' : 'Back up now'}
        </button>
        <RestoreFileSheet label="Restore from a backup file…" className={styles.action} onOpen={clearNotice} />
      </Section>
      <DropboxBackupSection />
      {backupFile.status === 'failed' && (
        <p className={styles.message} role="alert">
          A backup could not be prepared: {backupFile.message}
        </p>
      )}
      {backupNotice !== undefined && (
        <p className={styles.message} role={backupNotice.tone === 'good' ? 'status' : 'alert'}>
          {backupNotice.text}
        </p>
      )}
    </>
  );
}

function describeLastBackup(query: ReturnType<typeof useDatabaseQuery<string | undefined>>): string {
  if (query.status === 'loading') return '…';
  if (query.status === 'failed') return query.message;
  const days = daysSinceBackup(query.value, new Date());
  if (days === undefined) return 'Never';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}
