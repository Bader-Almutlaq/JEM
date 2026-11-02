/**
 * Turns a burst of database change notifications into one refresh. The first notification schedules a
 * flush (in the app: the next animation frame, or 100 ms when the page is hidden); later ones before it
 * runs only raise the version. The flush receives the newest version seen.
 * Plain TypeScript: the scheduler is passed in, so tests drive it by hand.
 */
export class ChangeCoalescer {
  private latestVersion = 0;
  private isScheduled = false;

  constructor(
    private readonly schedule: (flush: () => void) => void,
    private readonly onFlush: (version: number) => void,
  ) {}

  /** Records a change at `version`, scheduling one flush if none is pending. */
  notify(version: number): void {
    this.latestVersion = Math.max(this.latestVersion, version);
    if (this.isScheduled) return;
    this.isScheduled = true;
    this.schedule(() => {
      this.isScheduled = false;
      this.onFlush(this.latestVersion);
    });
  }
}
