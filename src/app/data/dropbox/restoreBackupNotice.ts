/** Shared success text for file and Dropbox restores; the worker supplies the finished-workout count. */
export function restoreBackupNotice(workoutCount: number): string {
  return `Restored ${workoutCount.toLocaleString()} workouts. Your previous data is kept as a safety snapshot on this phone.`;
}
