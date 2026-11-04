import { database, useDatabaseQuery } from '../../data/database';
import { useState } from 'react';
import { dropboxBackup } from '../../data/dropbox/cloudBackup';
import { useDropboxBackup } from '../../data/dropbox/useDropboxBackup';
import { Button } from '../../design/components/Button';
import { DropboxAppKeyForm } from '../settings/DropboxAppKeyForm';
import { DropboxConnect } from '../settings/DropboxConnect';
import { RestoreFileSheet } from '../settings/RestoreFileSheet';
import styles from './RestoreDataCard.module.css';

/** A quiet restore entry point only while the worker reports no owner data; connections return to Settings discovery. */
export function RestoreDataCard() {
  const empty = useDatabaseQuery('database-empty', () => database.isDatabaseEmpty());
  const state = useDropboxBackup();
  const showCard = empty.status === 'ready' && empty.value;
  const [connecting, setConnecting] = useState(false);
  // Not connected on this phone yet: the steps to connect appear here, and restoring follows by itself.
  const connectOrRestore = () => {
    if (state.connected) void dropboxBackup.openRestore();
    else setConnecting(true);
  };

  return (
    <>
      {empty.status === 'failed' && (
        <p className={styles.message} role="alert">
          {empty.message}
        </p>
      )}
      <section className={showCard ? styles.card : undefined} aria-label={showCard ? 'Restore your data' : undefined}>
        {showCard && (
          <>
            <h2 className={styles.title}>Restore your data</h2>
            <Button isDisabled={!state.enabled || state.phase !== 'idle'} onPress={connectOrRestore}>
              Restore from Dropbox
            </Button>
            {connecting && !state.connected && (
              <>
                <DropboxConnect />
                <DropboxAppKeyForm />
              </>
            )}
            {state.message !== undefined && (
              <p className={styles.message} role="alert">
                {state.message}
              </p>
            )}
          </>
        )}
        <RestoreFileSheet showAction={showCard} />
      </section>
    </>
  );
}
