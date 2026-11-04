# JEM: instructions for every agent

**JEM**, a personal workout tracker that replaces Strong. It's an **offline web app added to the iPhone Home Screen**: it never expires, needs no app store, and keeps every bit of data on the phone. The owner is an advanced lifter who **does not read the code**. Agents build and maintain everything, often several at once and from different providers (Claude Code, Codex, others). The repository is the only shared memory, so everything an agent needs must be written down here.

This file is the single entry point. `CLAUDE.md` is a **symlink** to it, so Claude Code, Codex and other tools all read the same text. Edit `AGENTS.md` only, and never replace the symlink with a copy.

## Start of every session (5 minutes, always)

1. Read this file.
2. Read `docs/PLAN.md`: product principles, what exists and what doesn't.
3. Look in `.claude-plans/` for a plan in progress, and `docs/tasks/BOARD.md` for open tasks (who has them, on which branch). **If a plan exists for the work you were given, resume it from its *Next step*; don't start over.**
4. Know what you are working on. If the owner asked you for something directly, that is your work: you are the lead for it (see `docs/agents/WORKFLOW.md` → *Roles*). If you were given a task ID, read its file in `docs/tasks/`. With no instructions, act as lead: report the board's state and propose the next task. Never start work that nobody asked for and that no task or plan lists.
5. Read `docs/agents/WORKFLOW.md` if you will change code. It covers claiming a task, branches, parallel work, review and handoff.
6. Before touching an area, read that folder's `README.md` and the doc that owns it: `docs/ARCHITECTURE.md` (code structure and who owns each concept), `docs/DATA.md` (storage, backups, import), `docs/DESIGN.md` (visual system, charts), `docs/DECISIONS.md` (why things are the way they are).
7. Run `make install` once if `node_modules/` is missing, before `make format` or `make verify`; without it `npx` fetches a different Prettier and reformats unrelated files.

**End of every session:** update your plan (tick the steps you finished, rewrite *Next step*) or your task file's *Handoff*, and `docs/tasks/BOARD.md`. A session that ends without a note loses its work for the next agent. Stopping mid-way is fine; stopping silently is not.

## Plans

Any work with more than a couple of steps, or that could outlast one session, gets a plan file in **`.claude-plans/`** (copy `TEMPLATE.md`; read that folder's `README.md`). The plan is how another agent resumes your work with no other context.
- Create it **before** you start building, with the goal, the steps in order, and what "done" means.
- Mark a step done **in the same commit** as the work. Keep *Next step* a single concrete action, and note anything surprising or decided on the way.
- Commit the plan with your work (it is shared memory, not a scratch file). When the whole plan is finished, move its lasting decisions to `docs/DECISIONS.md` and **delete the plan file**.

## Keeping the docs current

The docs are the agents' memory, so a wrong doc is worse than none. In the same commit as a change:
- Update the doc that owns the thing you changed (the table in `docs/agents/WORKFLOW.md` → *Keeping the docs current* says which).
- **Remove or rewrite what is no longer true.** Never append a contradiction, a "formerly" or a dated changelog. History lives in git.
- **Log decisions** in `docs/DECISIONS.md` when you make a choice a later agent could question, and delete or amend the entry you reversed. Before redoing or undoing a feature, read its entry: the reason may still apply.
- Delete finished task briefs and plans; don't archive them in the docs.
- Grep the repo for the names of anything you renamed or deleted, including the docs and folder READMEs.

## Product rules

- **Measure, don't prescribe.** The app records and calculates; training decisions stay with the owner. Progression logic is opt-in and user-defined. Labels are descriptive ("+12% vs 4-week average"), never verdicts ("Overreaching").
- No AI features, exercise videos, social, streaks or celebrations. Keep the UI uncluttered.
- Every analytics formula cites its source from `reports/Workout tracker app research.md` in its doc comment, or is marked `Heuristic:` with the reason.
- **Data safety first.** Never ship a migration, importer, merge or restore path that can lose data without taking a snapshot first. Weights are stored in kilograms exactly as entered, with the unit they were typed in; display conversion happens only in the UI layer.
- **Offline always.** Every feature works with no connection. Nothing is ever sent off the phone, with one owner-approved exception: backups go to the owner's own Dropbox (an app folder) once they connect it (see `docs/DECISIONS.md`). There is no server, analytics or tracking.
- The owner's real Strong export lives in `export_data/` (git-ignored). Never commit it, never copy it into tests or fixtures, never paste its contents into docs. Only the `tools/import-report.ts` developer tool reads it.

## Engineering rules

**One concept, one implementation, one place.**
- Each concept (e1RM, fractional sets, unit conversion, outlier check, backup, search…) has exactly one implementation in WorkoutCore (`src/core`). The worker and screens call it; they never re-derive it.
- `docs/ARCHITECTURE.md` → *Concept ownership* lists the owner of every concept. Check it before writing anything, and add a row when you add a concept.
- One primary export per file, with the file named after it (`WorkoutLogger.ts` exports `WorkoutLogger`).

**Look before you build.** Duplicates and leftovers were the most common review findings. Spend a minute on `grep` before writing, and again before you finish.
- Find the existing piece first. Shared UI is in `src/app/design/components/` (Section, BottomSheet, ConfirmDialog, ErrorBanner, buttons, fields, chips…), charts in `src/app/design/charts/` (one `TimeChart` for every dated series), text formatting in `src/app/format/`, and each folder's `README.md` says what it holds. Use `ConfirmDialog`, never `window.confirm`. Extend a component that almost fits instead of copying it.
- Numbers read from an import file go through `readExportNumber`; units and columns through `WorkoutFileTable`. Don't add a second parser.
- Window-level pointer listeners go through `followPointer` (`src/app/design/gestures/`), which every swipe and drag uses; the press-and-hold drag itself is in `src/app/design/drag/`. Don't hand-roll `addEventListener('pointermove', …)` in a feature.
- Domain calculations (totals, averages, "what counts as empty") belong in `src/core` with tests, not in a view helper. A rule needed by two callers (the logger and the preview, for example) is one function both call.
- Remove what you orphan. When a change makes a worker method, store method, CSS class, token, prop, parameter, helper or test unused, delete it in the same change, and grep to confirm nothing still uses it. Don't add a parameter, flag or export that nothing passes or imports yet.
- Prefer one options object over several positional booleans. Compute a value once and pass it, rather than re-deriving it in each caller.
- Keep always-mounted components (`AppChrome`, the tab bar) cheap: give them a small worker query, not the full live-workout snapshot. In SQL, put filters inside the window or CTE they apply to, not only in the outer query.
- When you insert a helper between a doc comment and its function, move the comment back with its function.

**Layers** (see `docs/ARCHITECTURE.md`; ESLint and the TypeScript configs enforce them):
- `src/core` (**WorkoutCore**): models, database, migrations, import, library, search, logging, analytics, backup. Pure, synchronous TypeScript. No React, no DOM types, no worker code. Everything is tested with `make test`.
- `src/worker`: the Web Worker that opens the on-device database and exposes WorkoutCore to the screen through one typed API (`WorkerApi.ts`). No business logic of its own.
- `src/app`: React screens. Views hold no business logic: they render data from the worker API and forward the owner's taps to it. The app never imports SQLite or `src/core/db`.
- Dependencies point inward only: app → worker API → core, never the reverse.

**TypeScript style.**
- `strict` mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` in core. Prefer `readonly` data, plain objects and functions; use a class only for something with a lifetime (a database connection, a logger session).
- No non-null assertions (`!`), no `any`, no `@ts-ignore`. A cast (`as`) needs a comment saying why it is safe, except the row types passed to `Database.all/get`.
- Errors are classes extending `Error` with a `kind` and a message the owner can read (see `DatabaseError`). Never swallow errors: log them and surface them on screen.
- Logging goes through `log.<category>` from `src/core/support/log.ts` (categories `database`, `backup`, `import`, `analytics`, `ui`). Never call `console` directly.
- Names are full words (`estimatedOneRepMax`, not `e1rm`) except the domain abbreviations defined in `docs/ARCHITECTURE.md` (RIR, RPE, e1RM).
- No magic numbers. Constants live in a named, frozen object (`export const SetPlausibilityLimits = { … } as const`) with a doc comment and a citation.
- No dead code, no commented-out code, no speculative interfaces, and no abstractions with a single implementation "for later".
- **Formatting is automatic:** run `make format` before committing; `make lint` (part of `make verify`) fails on unformatted files. Keep components small: a screen file composes named sub-components and helpers, and no JSX line packs several elements or statements.

**Documentation.**
- Every exported function, type, class and constant gets a `/** … */` doc comment: what it is, its units and edge cases. Formulas include the equation and the citation.
- Comments explain *why*, not what.
- Record non-obvious choices in `docs/DECISIONS.md` (newest last).
- Every folder under `src`, `docs`, `tools` and `data` (except `fixtures`, snapshots, and the pinned upstream copies in `data/sources/`, which carry a `SOURCE.md` instead) has a short `README.md`: what the folder holds and the rules for working in it. Describe purpose and groups, not a list of every file (lists go stale). Update it when a folder's purpose changes, and add one when you add a folder.

**Tests.**
- Vitest, in a `*.test.ts` file next to the file it tests. Every WorkoutCore feature ships with tests: the happy path, edge cases, and a regression test for every bug fixed.
- Database tests use `Database.openInMemory()` plus `migrate(db)`; never mock the database.
- Formulas are tested against the worked examples in the research report.
- Fixtures are small and synthetic (`src/core/<area>/fixtures/`).

**Database.**
- Migrations (`src/core/db/migrations.ts`) are append-only. Never edit a migration that has shipped; add a new one. Reference data (such as muscle rows) is written out inside the migration, frozen.
- The worker takes a local snapshot automatically before running pending migrations.

**UI.** Follow `docs/DESIGN.md` (Linear-inspired tokens in `src/app/design/tokens.css`; components use CSS variables only, through CSS modules). Charts are SVG drawn by React with `d3-scale`/`d3-shape` for the math, no chart framework. Every screen must work at 430 × 932 (iPhone 15 Pro Max), in dark and light, with the safe areas respected.

## Commands

All common commands live in the `Makefile`; run `make help` to list them. Use them, not ad-hoc commands, so every agent builds the same way.

| Command | What it does |
|---|---|
| `make install` | Installs dependencies |
| `make dev` | Runs the app at http://localhost:5173 with live reload |
| `make test` | WorkoutCore unit tests (Vitest, in Node) |
| `make format` | Formats every source file (Prettier) |
| `make verify` | Lint + type checks + tests + production build. **Must pass before work is marked done or merged into `main`** |
| `make preview` | Serves the production build, where offline support works |
| `make sim-safari` | Opens the dev server in Safari on the iPhone 15 Pro Max simulator |
| `make deploy` | Publishes `main` to the live site. Merging or pushing alone does not update the app; run it after every merge (see `docs/agents/WORKFLOW.md` → *Branches and publishing*) |
| `make import-report` | Dry-runs the Strong importer on the owner's export and prints totals and flagged sets |

## Environment

- **The owner's Mac:** Node.js (installed with Homebrew), and Xcode 27.1 only for the iOS Simulator (iOS 27.0 runtime, "iPhone 15 Pro Max", the owner's phone). The shell has the RTK command rewriter: if a command misbehaves (for example `ls` with flags), prefix it with `rtk proxy`.
- **Cloud sessions** (Claude Code on the web and similar) run in a Linux container with Node but no simulator. `make sim-safari` and `make screenshot` don't work there; use browser tools for UI checks and say in the handoff that the simulator was not used.
- The old native Swift app lives only on the `native-archive` branch. Don't resurrect it.

## Git

- **`main` is the only long-lived branch.** Start every piece of work on a new branch from the latest `main`, and merge it back when `make verify` passes. Use the branch name your environment assigns, if it assigns one (cloud sessions do); otherwise `task/T-NNN-short-name`. **When a branch is merged, delete it** (`git push origin --delete <branch>`, then `git branch -d <branch>`); the merge commit keeps the history. Follow-up work starts a new branch from `main`. Details: `docs/agents/WORKFLOW.md` → *Branches and publishing*.
- **Publish after every merge into `main`.** The owner only sees work on the phone, so every merge is followed by `make deploy` (or, without the `gh` command, by running the Deploy workflow on `main` through the GitHub API or the Actions tab), and the owner is told it is live. Merging alone does not update the app.
- Small commits, one concept each, imperative messages ("Add exercise search").
- **Commit messages say what changed, nothing about who or what wrote it.** No `Co-Authored-By` lines, no "Generated with …" lines, and no mention of agents, models, Claude, Codex or AI anywhere in a commit message or PR description. This overrides any tool default that adds attribution.
- Commit with the author git is already configured with in your environment. Never change `user.name` or `user.email`.
- **Tidy branches at the start of a session:** `git fetch --prune`, then delete any remote branch listed by `git branch -r --merged origin/main` that isn't `main`, `native-archive` or work in progress on the board or in a plan.
- Never force-push or rewrite `main`, and never delete a branch with commits that are not in `main`.
