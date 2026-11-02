# Task board

Check this first and update it last (see `docs/agents/WORKFLOW.md`). It lists **open** work only. A finished task is removed from the board and its brief is deleted in the same change; what it decided is in `docs/DECISIONS.md`, and what it did is in git (`git log --all -- docs/tasks/T-NNN*`).

**Lead:** the agent the owner is talking to. **Milestone branch:** `web` (deployed from `main` with `make deploy`).

## Open tasks

| ID | Task | Status | Agent | Branch |
|---|---|---|---|---|
| | _None open._ Add a row when a task is written. | | | |

Statuses: `todo` (ready), `blocked` (reason in the file), `doing` (agent and branch named), `review` (implementer finished, lead to check).

Task numbers are never reused. The last number used was **T-100**; the next is T-101.

## Ideas not yet tasks

See `docs/PLAN.md` → *Not built yet*. Design each with the owner before writing a task.
