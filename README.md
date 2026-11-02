# JEM

An open-source, offline-first workout tracker for the iPhone Home Screen. JEM is built for lifters who want fast set logging and honest, source-backed numbers, and who want their training history to stay on their own phone.

**Try it:** open <https://bader-almutlaq.github.io/JEM/> in Safari on an iPhone and add it to the Home Screen (see [Install](#install-on-an-iphone)).

## Why JEM

- **Your data stays on your phone.** There is no account, no server, no analytics and no ads. The database is a SQLite file in the app's private storage. The only thing that ever leaves the phone is a backup you choose to send to your own Dropbox.
- **It works offline, always.** Every feature runs with no connection. The app is a Progressive Web App: it never expires and needs no app store.
- **It measures; it doesn't prescribe.** JEM records what you did and calculates from it. Labels are descriptive ("+12% vs 4-week average"), never verdicts. Progression rules are opt-in and defined by you.
- **Every formula cites its source.** Analytics trace to the research report in [`reports/`](reports/) or are marked as heuristics in the code.

## Features

- **Logging:** previous numbers inline, pre-filled sets, a large number pad with kg/lb toggle, automatic warm-ups, a rest timer, supersets, notes, and a typo check that asks "Is this right?" before an outlier is saved.
- **Exercise library:** a curated library with muscle mappings, aliases, gym-slang and typo-tolerant search, pictures, and your own custom exercises.
- **Plans and templates:** folders, drag-to-reorder, targets per set, optional double progression and deloads, start from a template or from any past session.
- **History:** calendar, per-workout comparison with personal bests, and editing of past workouts.
- **Analytics:** estimated one-rep max, strength trend, hard sets and fractional sets per muscle, rep and effort distributions, intensity mix, and long-range charts with a table view.
- **Body measurements:** circumference and weight tracking with change over 4 and 12 weeks.
- **Import:** bring your history from Strong, FitNotes, Fitbod or Hevy CSV exports, with a review step that flags suspicious sets before anything is written.
- **Backups:** one-tap backup file, optional automatic backup to your own Dropbox, and restore with a safety snapshot first.

## Install on an iPhone

1. Open **https://bader-almutlaq.github.io/JEM/** in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open JEM from the Home Screen icon from then on.

Deleting the Home Screen icon deletes the data on the phone. Back up from Settings now and then.

**Moving to a new address, or reinstalling:** the new icon starts empty.

1. In the old app: Settings → Dropbox → **Back up to Dropbox now**, and check the file in Dropbox (Apps folder). Also tap **Back up now** to save a copy in Files.
2. Open the new address in Safari and add it to the Home Screen. Keep the old icon until the data is back.
3. In the new app, the Workout tab shows **Restore your data**. Connect Dropbox (open Dropbox, paste the code; paste your own app key first if you use one) or pick the file, and confirm.
4. Check your workouts and plans, then delete the old icon.

## Run it locally

You need [Node.js](https://nodejs.org/) (the CI uses version 24) and `make`.

```bash
make install   # once, after cloning
make dev       # the app at http://localhost:5173, with live reload
make verify    # lint, type checks, tests and a production build
make help      # every command
```

`make preview` serves the production build, which is where offline support works (`make dev` skips the service worker).

## How it is built

| Layer | Folder | What it is |
|---|---|---|
| WorkoutCore | [`src/core`](src/core) | Pure, synchronous TypeScript: models, database, migrations, import, library, search, logging, analytics and backup. No React, no DOM. Tested in Node. |
| Worker | [`src/worker`](src/worker) | A Web Worker that opens the on-device SQLite database and exposes WorkoutCore through one typed API. |
| App | [`src/app`](src/app) | React screens. They render what the worker returns and forward taps to it. |

SQLite runs as WebAssembly in the browser's private file system. Charts are plain SVG drawn by React, with `d3-scale` and `d3-shape` for the maths. Dependencies point inward only (app → worker → core), and ESLint enforces it.

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the layout and for which file owns each concept, [`docs/DATA.md`](docs/DATA.md) for storage and backups, and [`docs/DESIGN.md`](docs/DESIGN.md) for the visual system.

## Repository map

| Folder | Contents |
|---|---|
| [`src/`](src) | The application source: `core`, `worker`, `app` |
| [`docs/`](docs) | Plan, architecture, data, design, decisions, and the task board |
| [`tools/`](tools) | Developer scripts: library and illustration builders, import report, benchmarks |
| [`data/`](data) | Pinned third-party exercise sources and the reviewed mapping into JEM's library |
| [`reports/`](reports), [`research_notes/`](research_notes) | The research behind every formula |
| [`public/`](public), [`design/`](design) | Home Screen icons and the SVG source they are rendered from |
| [`reference/`](reference) | The archived native Swift version, kept as a read-only porting spec |
| [`.github/`](.github) | The GitHub Pages deploy workflow |

Each source and documentation folder has its own `README.md` describing what it holds.

## Contributing

Contributions are welcome. Start with [`AGENTS.md`](AGENTS.md): it holds the engineering rules, the product rules, and the checklist to follow before writing code. Work is tracked in [`docs/tasks/BOARD.md`](docs/tasks/BOARD.md) and described in [`docs/agents/WORKFLOW.md`](docs/agents/WORKFLOW.md). In short:

1. Pick or propose a task, and work on a branch.
2. Reuse what exists (see "Before you write code" in `AGENTS.md`).
3. Add tests next to the code, and run `make format` then `make verify`. It must pass.
4. Keep commits small, with an imperative message that says what changed.

Please don't commit personal training exports. `export_data/` is git-ignored for that reason.

## Privacy

JEM has no backend. Hosting on GitHub Pages serves the code only, never data. Cloud backup is off until you connect your own Dropbox, and it writes only to that app's folder. See [`docs/DATA.md`](docs/DATA.md).

## Credits

Exercise data and pictures come from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (The Unlicense) and [everkinetic](https://github.com/everkinetic/data) (CC BY-SA 4.0). Credits are also shown in the app under Settings → Credits.

## License

No license has been chosen yet, so by default all rights are reserved. Add a `LICENSE` file before accepting outside contributions.
