# Plan: Reliability pass (publishing, checks, logging speed, import numbers, polish)

- **Status:** in progress
- **Created:** 2026-11-04
- **Last update:** 2026-11-04 by Claude (cloud session)
- **Branch:** work is committed locally and fast-forwarded straight onto `main` (cloud sessions cannot delete branches, so none is pushed)
- **Related:** `.claude-plans/2026-11-02-simplify-followups.md` (steps A1, B2, C2 and C4 there are done here)

## Goal

The owner asked for every recommendation from 2026-11-04 to be done: publishing that does not depend on an agent remembering, checks before work reaches `main`, a faster logging screen, safe number reading for Strong measurements, and three polish items.

## Done when

- [ ] Every step below is done, or dropped with a note saying why.
- [ ] `make verify` passes, and the live site is published from the final `main`.
- [ ] Docs and `docs/DECISIONS.md` updated; the simplify plan's finished steps ticked.

## Context

- Read first: `AGENTS.md` (Git, publishing), `docs/agents/WORKFLOW.md` → *Branches and publishing*, `docs/DATA.md` → *Hosting*, `.github/workflows/deploy.yml`.
- The Deploy workflow has `on: push` to `main`, yet GitHub lists zero runs from a push event; every run so far was started by hand.
- Cloud sessions cannot delete remote branches (the git proxy answers 403), and have no `gh` command; they start the Deploy workflow through the GitHub API.

## Steps

- [x] 1. **Logging screen: stop the emptiness check during a workout.** `WorkoutScreen` reads `isDatabaseEmpty` after every write even while a workout is live. Move the query into the no-workout branch. Behaviour: none visible.
- [x] 2. **Tab bar: a light query.** `AppChrome` re-reads the full live-workout snapshot after every write on every screen. Add a core query and worker method that return only the active workout's id, name and start time. Behaviour: none visible.
- [x] 3. **RPE badge.** The effort badge on the check box crosses the working-set outline. Keep it inside the row. Verify in screenshots, dark and light.
- [x] 4. **Strong measurements read numbers like every other importer.** Replace the comma-to-dot conversion with `readExportNumber`. Behaviour: an ambiguous value such as `1,234` is now flagged instead of silently read as 1.234. Only future imports are affected; the owner should run `make import-report` on the Mac to compare.
- [ ] 5. **DESIGN.md**: remove the contradictory duplicate paragraphs about the live workout and put each rule under the right heading.
- [ ] 6. **One window-pointer helper** for swipe-down, exercise reorder and workout drag. Behaviour risk: iOS touch handling; checked in the browser here, and by the owner on the phone after publishing.
- [ ] 7. **Workflows.** Update the actions GitHub is retiring (Node 20), add a Verify workflow that runs `make verify` on every branch push and pull request, and find out whether a push to `main` now starts Deploy. Owner action: turn on *Automatically delete head branches* in the repository settings.
- [ ] 8. Publish, confirm the run succeeded, update docs and close this plan.

## Next step

Step 5: merge the two contradictory "Live exercise metadata" paragraphs in `docs/DESIGN.md` (under *Plan summary*) into the *Live workout* section, keeping only what the code does.

## Notes

- Step 4: an ambiguous value throws the existing `invalidValue` import error (the whole measurement file stops with the line named), as other bad measurement values already did. `1.234,5` and `1,234.5`, refused before, are now read. Still to do on the Mac: `make import-report` on the real export to confirm nothing changed.
- Step 3: the badge moved 6 px down and 4 px into the row's side padding, onto the tick box's corner.
- Steps 1–2: `WorkoutScreen` now has a `NoWorkoutScreen` child that owns the emptiness query. `AppChrome` reads `activeWorkoutSummary` (new core query, also behind `WorkoutLogger.activeWorkoutId`, so the "which workout is in progress" rule stays in one place).
