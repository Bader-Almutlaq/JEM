# app

The React screens. Views render what the worker returns and forward the owner's taps to it; they hold view state only (what is selected, what is being typed) and no business logic. The app never imports SQLite or `core/db`.

| Folder | Holds |
|---|---|
| [`features/`](features) | One folder per screen area |
| [`design/`](design) | Tokens, global CSS, shared components, charts and gestures |
| [`format/`](format) | Turning numbers and dates into text |
| [`data/`](data) | The worker client, `useDatabaseQuery`, offline updates, Dropbox |
| [`navigation/`](navigation) | Routing helpers and view transitions |
| [`appearance/`](appearance) | System / Dark / Light preference |

`main.tsx` is the entry point, `App.tsx` holds the routes, and `AppChrome.tsx` is the tab bar and other chrome shown on every screen (keep what it queries cheap). Every screen must work at 430 × 932 in dark and light with the safe areas respected.
