# Agent workflow

How agents share this project without losing context. Every agent follows it, whichever provider runs it (Claude Code, Codex or another). It assumes you've read `AGENTS.md`.

## Roles

| Role | Who | Does |
|---|---|---|
| **Owner** | The human | Sets goals, answers product questions, tries builds on the phone. Doesn't read code. |
| **Lead** | One agent at a time, usually the strongest model | Turns goals into tasks, makes design and cross-cutting decisions, reviews and merges work, keeps `docs/PLAN.md` and the board current. |
| **Implementer** | Any agent, often a cheaper model | Takes one task, does exactly that, verifies it and writes a handoff. |

A fresh chat with no instructions acts as **lead**: read the board and `.claude-plans/`, report the state to the owner, propose the next task. An agent the owner asks for something directly is the lead for that work: if it has more than a couple of steps it gets a plan, and if it will be handed to another agent it gets a task brief.

## The task board

- `docs/tasks/BOARD.md` lists the open tasks with their status, agent and branch. It is the first thing to check and the last thing to update.
- Each task has one file, `docs/tasks/T-NNN-short-name.md`, created from `docs/tasks/TEMPLATE.md`. The file is the full brief: an implementer should need nothing else besides the docs it links to.
- Statuses:
  - `todo`: ready to take.
  - `blocked`: waiting on something named in the file.
  - `doing`: claimed; the board names the agent and the branch.
  - `review`: implementer finished, lead to check.
  - Finished tasks have no status: once merged, the lead deletes the row and the brief (see *Closing a task*).

### Taking a task

1. Pick a `todo` task whose *Depends on* tasks are finished (no longer on the board).
2. On the board, set it to `doing` and fill *Agent* (for example "Claude Sonnet, chat 2026-10-30") and *Branch*. Commit just that edit if others are working in parallel, so they see the claim.
3. Create the branch from the latest `main` (see *Branches and publishing*), and write its name on the board.
4. Work only inside the task's **Scope** (the files and folders it lists). Anything else that needs changing goes into the handoff as a note for the lead; don't change it.

### Finishing a task

1. `make verify` passes (lint, type checks, tests, build). For UI tasks, also look at every screen you changed (see *UI checks*).
2. Fill the task file's **Handoff**: what you did, files touched, decisions taken, anything left or doubtful, and how you verified it.
3. Set the board status to `review`. Commit on your branch with an imperative message.
4. Stop. The lead reviews and merges.

### Stopping half-way

Write the handoff anyway, say exactly where you stopped and what the next step is, and leave the status at `doing`. Commit work-in-progress on the task branch with the message `WIP: …`. Never leave uncommitted changes as the only copy of work.

## Parallel work

- Two agents never edit the same file at the same time. Task scopes are written so they don't overlap; if two tasks must touch the same file (for example `src/app/App.tsx`), they run one after the other.
- Each parallel agent works in its own git worktree: `git worktree add .claude/worktrees/T-NNN -b task/T-NNN-short-name main`, then `make install` inside it, so builds and branches don't collide. `.claude/worktrees/` is git-ignored and skipped by Prettier and ESLint. Use a different dev-server port per worktree (`npx vite --port 5174`).
- Shared files that only the lead edits: `AGENTS.md`, `docs/PLAN.md`, `docs/ARCHITECTURE.md` (concept table), `docs/DECISIONS.md`, `package.json`, `vite.config.ts`, `eslint.config.js`, the `tsconfig` files, `src/core/db/migrations.ts`, `src/app/App.tsx` (routes) and `src/app/design/tokens.css`. An implementer that needs a change there asks for it in the handoff, or the task file hands it over explicitly. To add a `WorkerApi` method, add it in its own clearly marked block so parallel tasks merge cleanly.
- **Exception:** a task file can explicitly hand one of these to its implementer, for example "add a row to the concept table".

## Review (lead)

Check each `review` task against its acceptance criteria, then against this list:

- `make verify` passes on the branch.
- The change stays inside the scope; there's no duplicate implementation of an existing concept (check the concept table).
- Doc comments are on every public API; there are no magic numbers, non-null assertions (`!`), `any` or direct `console` calls; errors are typed and surfaced.
- Tests cover the happy path, the edge cases, and a regression test per bug fixed.
- The UI uses design tokens only, and the screenshot looks right in dark and light.
- Docs are updated where behavior changed (see *Keeping the docs current*), and nothing the change made unused is left behind.

Then merge the branch into `main` (see *Branches and publishing*) and delete the worktree.

### Closing a task (lead)

In the merge commit or the one after it:
1. Copy what a future agent needs to know into `docs/DECISIONS.md` (see *Keeping the docs current*).
2. Delete the task's brief and its board row. Git history keeps them.
3. Delete the merged task branch (see *Branches and publishing*).
4. If the task belonged to a plan in `.claude-plans/`, tick its step there.

## Branches and publishing

This section is the one home for these rules; `AGENTS.md` → *Git* summarises it.

- **`main` is the only long-lived branch,** and it always passes `make verify`, because it is what gets published. There is no separate milestone branch (the old `web` branch is stale; never branch from it).
- **Start from the latest `main`.** Fetch first, then branch. Name the branch what your environment assigns, if it assigns one (cloud sessions do); otherwise `task/T-NNN-short-name` for a task, or a short descriptive name for plan work. Write the name on the board row or in the plan's *Branch* line.
- **Merge back into `main`** when `make verify` passes and the work has been reviewed: either the lead merges locally (`git merge --no-ff <branch>`, then `git push origin main`), or the owner merges the branch's pull request on GitHub. Open a pull request only when the owner asks for one.
- **A merged branch is finished: delete it.** GitHub deletes a pull request's branch when it is merged (the owner's repository setting). Otherwise whoever merges a branch (the lead locally, or the agent whose branch the owner merged on GitHub) deletes it from the remote in the same session: `git push origin --delete <branch>`, then `git branch -d <branch>` locally. Cloud sessions cannot delete remote branches (the git proxy refuses), so they fast-forward `main` from their local branch instead of pushing a branch, or tell the owner which branch to delete. Merging with `--no-ff` keeps the history, so nothing is lost. Don't add commits to a merged branch; follow-up work starts a new branch from `main`, and a plan's *Branch* line that names a merged branch is replaced.
- **Clean up what you find.** At the start of a session, run `git fetch --prune` and `git branch -r --merged origin/main`. Delete any branch listed there that is not `main` and is not on the board or in a plan as in progress. Never delete `main` or `native-archive`, and never delete a branch with commits that are not in `main`: ask the owner instead.
- **Publish after every merge, and confirm it.** The owner can only check work on the phone, so every merge into `main` must reach the live site. A push to `main` starts the *Deploy* workflow; after pushing, check that a Deploy run for the new commit started and succeeded. If none started within a minute, start one by hand: `make deploy`, or, where the `gh` command is missing (cloud sessions), run the Deploy workflow on `main` through the GitHub API or the Actions tab. The workflow runs `make verify` and publishes only if it passes. Only tell the owner it is live once the run succeeded; the installed app then downloads the update in the background and shows "Update ready". GitHub Pages is sometimes slow: a publish step that hangs for 10 minutes fails on its own, and starting the workflow again later is the fix.
- **Every branch is checked.** The *Verify* workflow runs `make verify` on every push to a branch other than `main` and on every pull request; a red Verify is fixed before merging.
- Never force-push or rewrite `main`, and never delete a branch whose commits are not all in `main`.

## Choosing a model

The work is mostly routine; spend strong models where judgement matters.

| Work | Model tier |
|---|---|
| Planning, writing task briefs, schema and migration design, analytics formulas, review, debugging something subtle | Strongest available (Claude Opus or the equivalent) |
| Implementing a well-specified task: a screen from a written spec, a query, tests for a defined API | Mid tier (Claude Sonnet, Codex default or the equivalent) |
| Mechanical edits: renames, doc touch-ups, adding fixtures | Small tier (Claude Haiku or the equivalent) |

If a mid-tier implementer gets stuck twice on the same problem, stop and hand it back to the lead in the handoff rather than guessing.

## UI checks

- Start the app with `make dev` (http://localhost:5173).
- **Agents with browser tools:** set the viewport to 430 × 932 (iPhone 15 Pro Max), take screenshots in dark and light (emulated color scheme, or Settings → Appearance), and tap through the flow.
- **Real iPhone Safari:** `make sim-safari` opens the dev server on the "iPhone 15 Pro Max" simulator (iOS 27.0); `make screenshot` saves what it shows. Use it before publishing anything that changes screens, and for anything touching safe areas, inputs, the keyboard, scrolling or storage. It needs the owner's Mac; cloud sessions use browser tools and say so in the handoff.
- Check: dark and light, the longest realistic text (for example "Triceps Pushdown (Cable - Straight Bar)"), the empty state, the loading state, and an error state.
- Offline support only runs in the production build: `make preview` (http://localhost:4173).
- Never load the owner's real export in the app for screenshots; use synthetic data.

## Writing a task brief (lead)

Copy `TEMPLATE.md`. A good brief:
- states the goal in one or two sentences, in the owner's terms;
- links the exact docs and existing types to read, so the implementer doesn't search;
- lists the scope: files to create or edit, and files not to touch;
- gives the public API or screen layout precisely enough that two agents would build the same thing;
- lists acceptance criteria that can be checked: test names, screen states, commands;
- is small enough to finish in one session (roughly under 600 lines changed).

## Plans

A task is one unit of work for one agent. A piece of work with several steps, tasks or sessions has a plan in `.claude-plans/` (read its `README.md`). The plan is the source of truth for where the work stands: update it as each step finishes, so a different agent can resume from it with no other context.

## Keeping the docs current

Every change that alters behaviour updates the doc that owns it in the same commit. Don't leave it for later; a doc that is wrong is worse than a missing one.

| You changed… | Update |
|---|---|
| Where a concept lives, or added one | `docs/ARCHITECTURE.md` → *Concept ownership* |
| Storage, backup, import or the schema | `docs/DATA.md` |
| Visual system, a screen pattern, charts | `docs/DESIGN.md` |
| An analytics formula or what a chart means | `docs/ANALYTICS.md` and the doc comment that cites the source |
| A choice someone might question, or reversed an earlier one | `docs/DECISIONS.md` (edit or delete the old entry; don't append a contradiction) |
| What the app can do, or doesn't yet | `docs/PLAN.md` → *What exists* / *Not built yet* |
| A folder's purpose or contents | that folder's `README.md` |
| A command or setup step | `Makefile`, `README.md` and `AGENTS.md` |

Rules:
- **Remove, don't append.** When something stops being true, delete or rewrite it. No "formerly", no struck-through text, no dated changelog inside a doc; git has the history.
- **State what is true now,** in the present tense, with the reason only where it isn't obvious.
- **One home per fact.** Link to the owning doc instead of repeating it.
- **`AGENTS.md` and `CLAUDE.md` are one file.** `CLAUDE.md` is a symlink to `AGENTS.md`; edit `AGENTS.md`, and never replace the symlink with a copy.
- Before finishing, grep the docs for the name of anything you renamed or removed.

## Tool notes

- **Commit messages** never mention the tool, model or agent that wrote the change, and carry no `Co-Authored-By` or "Generated with" lines. Tell every subagent the same.
- **Codex first.** The owner prefers implementation handed to Codex (Terra for routine work, Sol for formulas or tricky logic), with the lead keeping its own context for briefs, review and merging. Use Claude subagents when Codex is unavailable or near its limit. Give a cheaper model tasks that have a written brief with clear acceptance criteria; keep design decisions, cross-cutting changes and reviews on the lead model.
- **Parallel agents that write code** must not share files. Give each its own task file and, when possible, its own git worktree (`make install` in each new worktree).
- **Running Codex** on a well-specified task, in its own worktree, in the background:
  `git worktree add .claude/worktrees/T-NNN -b task/T-NNN-short-name main && cd .claude/worktrees/T-NNN && make install`, then
  `codex exec -m gpt-6.1-terra -c model_reasoning_effort=high -s workspace-write -C "<worktree>" -o "<worktree>/codex-report.md" "<prompt>" < /dev/null`.
  Use `gpt-6.1-sol` for harder work. Its sandbox can't write a worktree's git metadata, so tell it not to commit; review and commit its changes yourself. Run at most two Codex agents at a time (they draw on the owner's ChatGPT plan), one task-sized brief each.
- **Seeing the app:** start `make dev` in the background, use browser tools at 430 × 932 in dark and light, and `make sim-safari` for real iPhone Safari (see *UI checks*).
