# data

How screens reach the database and the outside world.

- `database.ts`: the Comlink client (`database`) and `useDatabaseQuery(key, () => database.someRead())`, which reruns after writes. `QueryResultStore` and `ChangeCoalescer` keep results, staleness and one-refresh-per-burst behind it.
- `appUpdate.ts`: offline support and the "Update ready" prompt. `persistentStorage.ts`: asks the browser to keep storage.
- `readPickedFiles.ts`: reads files the owner picks. `messageOf.ts`: error to readable text.
- [`dropbox/`](dropbox): optional cloud backup to the owner's own Dropbox.
