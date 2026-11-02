# .claude-plans

Plans for multi-step work, kept in the repository so any agent can stop and any other can resume with no other context. This folder is shared memory: commit plans with the work.

## When to write one

Write a plan before starting work that has more than a couple of steps, spans several tasks, or could outlast one session. A single small change needs no plan. A task brief in `docs/tasks/` is the unit of work for one agent; a plan can cover several of them.

## File name

`YYYY-MM-DD-short-name.md`, using the date the plan was created (for example `2026-11-02-simplify-followups.md`). Copy [`TEMPLATE.md`](TEMPLATE.md).

## Writing the plan

- **Goal and done-when** come first, in plain words. Someone reading only these two lines should know what success looks like.
- **Context** lists what to read (docs, files, decisions) so the next agent doesn't search.
- **Steps** are small, ordered and checkable, each finishable in one sitting. Each step names its files and how to verify it. Use checkboxes: `- [ ]` open, `- [x]` done.
- **Behaviour changes and risks** are written next to the step that causes them, so nobody discovers them by accident.

## Updating it while you work

1. Tick a step **in the same commit** as the work it describes, and add the short commit hash or one line of what changed.
2. Keep **Next step** to one concrete action. It is what the next agent does first.
3. Put surprises, dead ends and choices you made in **Notes**, newest first. A decision future agents might question also goes in `docs/DECISIONS.md`.
4. Set **Status** to `in progress`, `blocked` (say on what) or `ready to close`.
5. Before you stop, for any reason, make sure the plan matches reality, then commit it. If you ran out of time half-way through a step, say exactly where.

## Resuming

1. Read the plan top to bottom, then **Next step**.
2. Check the branch and `git log` match what the plan says. If they don't, fix the plan first.
3. Re-check any claim that may have aged (a file moved, a function renamed) before acting on it.
4. Do the next step, update the plan, repeat.

## Closing

When every step is ticked and `make verify` passes: copy the lasting decisions into `docs/DECISIONS.md`, update the docs the work touched, and **delete the plan file**. Finished plans are not archived; git history keeps them.
