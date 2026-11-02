# Tasks

- `BOARD.md`: the open tasks, their status, agent and branch. Check it first and update it last.
- `TEMPLATE.md`: copy it to create `T-NNN-short-name.md`. Numbers are never reused.
- A task is one self-contained unit of work for one agent. A larger piece of work that spans several tasks or sessions keeps its progress in [`.claude-plans/`](../../.claude-plans).
- The process (claiming, parallel work, review, handoff) is in `docs/agents/WORKFLOW.md`.
- When a task is done: record its decisions in `docs/DECISIONS.md`, update the docs it affected, delete its brief and remove its board row.
