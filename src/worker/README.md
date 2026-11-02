# worker

The Web Worker that owns the live database. It is the only place SQLite is opened.

- `database.worker.ts`: entry point; opens the store and exposes the API through Comlink.
- `OnDeviceStore`: the database file in the phone's private file system (OPFS), safety snapshots, and the storage side of backup and restore.
- `WorkerApi.ts`: one typed method per thing a screen may ask. Each call runs WorkoutCore and returns plain data; write methods notify subscribers so open screens refresh.

No business logic lives here. If a method needs a rule, put the rule in `src/core` and call it. Add new methods in their own clearly marked block so parallel changes merge cleanly. Keep screen-wide reads (anything an always-mounted component calls) cheap.
