import * as Comlink from 'comlink';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { daysSinceBackup } from '../../../core/backup/BackupAge';
import { parseBackupFileName } from '../../../core/backup/BackupFile';
import { database, messageOf, useDatabaseQuery } from '../../data/database';
import { readPickedFiles } from '../../data/readPickedFiles';
import { Section, SectionRow } from '../../design/components/Section';
import styles from './BackupSection.module.css';
import { useBackupFile } from './useBackupFile';
import { DropboxBackupSection } from './DropboxBackupSection';
import { RestoreConfirmDialog } from './RestoreConfirmDialog';

const BYTES_PER_MEGABYTE = 1024 * 1024;

/** A backup file the owner picked, waiting for them to confirm replacing the current data. */
interface PickedBackup {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** The outcome of the last action, shown under the buttons. */
interface Notice {
  readonly tone: 'good' | 'bad';
  readonly text: string;
}

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
  const [picked, setPicked] = useState<PickedBackup | undefined>();
  const [isRestoring, setIsRestoring] = useState(false);
  const [notice, setNotice] = useState<Notice | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const picker = event.currentTarget;
    if ((picker.files?.length ?? 0) === 0) return;
    setNotice(undefined);
    clearNotice();
    try {
      const [first] = await readPickedFiles(picker, async (file) => ({
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      }));
      if (first !== undefined) setPicked(first);
    } catch (error) {
      setNotice({ tone: 'bad', text: `That file could not be read: ${messageOf(error)}` });
    }
  };

  const restore = async () => {
    if (picked === undefined) return;
    const { bytes } = picked;
    setPicked(undefined);
    setIsRestoring(true);
    try {
      const result = await database.restoreBackup(Comlink.transfer(bytes, [bytes.buffer as ArrayBuffer]));
      setNotice({
        tone: 'good',
        text: `Restored ${result.workoutCount.toLocaleString()} workouts. Your previous data is kept as a safety snapshot on this phone.`,
      });
    } catch (error) {
      setNotice({ tone: 'bad', text: messageOf(error) });
    } finally {
      setIsRestoring(false);
    }
  };

  const displayedNotice = notice ?? backupNotice;

  return (
    <>
      <Section
        label="Backup"
        footnote="As an alternative to Dropbox, Back up now saves a copy of everything to Files; choose the same iCloud Drive folder each time. Restore replaces what is on this phone."
      >
        <SectionRow label="Last backup" value={describeLastBackup(lastBackupAt)} />
        <button
          type="button"
          className={styles.action}
          disabled={backupFile.status !== 'ready' || isRestoring}
          onClick={() => {
            setNotice(undefined);
            backUp();
          }}
        >
          {backupFile.status === 'loading' ? 'Preparing…' : 'Back up now'}
        </button>
        <button
          type="button"
          className={styles.action}
          disabled={isRestoring}
          onClick={() => fileInput.current?.click()}
        >
          {isRestoring ? 'Restoring…' : 'Restore from a backup file…'}
        </button>
        <input ref={fileInput} type="file" accept=".sqlite" hidden onChange={(event) => void pick(event)} />
      </Section>
      <DropboxBackupSection />
      {backupFile.status === 'failed' && (
        <Message tone="bad" text={`A backup could not be prepared: ${backupFile.message}`} />
      )}
      {displayedNotice !== undefined && <Message {...displayedNotice} />}

      <RestoreConfirmDialog
        description={picked === undefined ? undefined : describePicked(picked)}
        onCancel={() => setPicked(undefined)}
        onConfirm={() => void restore()}
      />
    </>
  );
}

/** A result line with an icon, so colour is never the only signal. */
function Message({ tone, text }: Notice) {
  const Icon = tone === 'good' ? CircleCheck : CircleAlert;
  return (
    <p
      className={`${styles.message} ${tone === 'good' ? styles.good : styles.bad}`}
      role={tone === 'good' ? 'status' : 'alert'}
    >
      <Icon className={styles.messageIcon} aria-hidden="true" size={16} />
      <span>{text}</span>
    </p>
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

function describePicked(picked: PickedBackup): string {
  const madeAt = parseBackupFileName(picked.name);
  const size = `${(picked.bytes.byteLength / BYTES_PER_MEGABYTE).toFixed(1)} MB`;
  return madeAt === undefined
    ? `${picked.name} (${size})`
    : `${picked.name} (${size}), made ${madeAt.toLocaleString()}`;
}
