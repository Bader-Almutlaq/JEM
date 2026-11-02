/**
 * Lets a back link say "the navigation that follows is a way back" even though it is an ordinary push in the
 * router's history, so the screen slides the right way. The flag lives for one event turn: the link's own
 * navigation consumes it synchronously, and the timeout clears it if that navigation never happens.
 */
export const backTransitionRequest = {
  requested: false,
  /** Marks the navigation about to happen as a way back. */
  mark(): void {
    backTransitionRequest.requested = true;
    window.setTimeout(() => {
      backTransitionRequest.requested = false;
    }, 0);
  },
  /** Returns whether a way back was marked, and clears the mark. */
  consume(): boolean {
    const requested = backTransitionRequest.requested;
    backTransitionRequest.requested = false;
    return requested;
  },
};
