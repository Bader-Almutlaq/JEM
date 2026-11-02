# src

All application source, split into three layers with a strict dependency direction: **app → worker → core**.

- [`core/`](core): WorkoutCore. Pure, synchronous TypeScript with no UI, tested in Node.
- [`worker/`](worker): the Web Worker that owns the on-device database and exposes WorkoutCore to the screens.
- [`app/`](app): React screens, design system and the client for the worker.

ESLint and the TypeScript configs enforce the direction: core never imports app or worker, and the app never imports SQLite or `core/db`. See [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the details and for which file owns each concept.
