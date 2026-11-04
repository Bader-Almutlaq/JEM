# gestures

Pointer gestures. `followPointer` follows one pointer on the window from press to release (it filters other fingers, can hold off touch scrolling, and removes its listeners in one call); every swipe and drag in the app is built on it, so an iOS touch fix is made once. `swipeDown` is the pure decision and `useSwipeDown` the hook that minimizes a workout. Never add window pointer listeners in a feature; use `followPointer`.
