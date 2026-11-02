import { ConfirmDialog } from '../../design/components/ConfirmDialog';

/** The same explicit replacement confirmation for picked files and downloaded Dropbox backups. */
export function RestoreBackupConfirmation({
  detail,
  onConfirm,
  onCancel,
}: {
  readonly detail: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <ConfirmDialog title="Restore this backup?" confirmLabel="Replace data" onConfirm={onConfirm} onCancel={onCancel}>
      <p>It replaces what is on this phone. Your current data is kept as a safety snapshot.</p>
      <p>{detail}</p>
    </ConfirmDialog>
  );
}
