import { useState } from 'react';
import { log } from '../../../core/support/log';
import styles from './DropboxBackupSection.module.css';

/** How long "Copied" stays on the button; a heuristic long enough to read on a phone. */
const COPIED_LABEL_MILLISECONDS = 2000;

/**
 * Copies `text` to the clipboard. If the browser refuses (some private modes), the button says so
 * and the text beside it stays selectable.
 */
export function CopyButton({ text, label }: { readonly text: string; readonly label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch (error) {
      log.ui.error('Copying to the clipboard failed', error);
      setState('failed');
    }
    setTimeout(() => setState('idle'), COPIED_LABEL_MILLISECONDS);
  };
  return (
    <button className={styles.copy} type="button" aria-label={`Copy ${label}`} onClick={() => void copy()}>
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select it instead' : 'Copy'}
    </button>
  );
}
