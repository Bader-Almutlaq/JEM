# T-098: Feedback from the first logged workout

- **Milestone:** Workout UX · **Depends on:** T-095 (merged) · **Model tier:** high

## Goal

The owner logged one workout on the phone (2026-11-02) and listed what to change. This task is that list.

## What changed

- **Input bugs.** Two quick taps on the pad ("1" then "5") registered only one: each key now folds into the latest draft (`applyDraftChange`). The RPE chip beside a set now follows the pad while RPE is typed instead of updating on close.
- **Live workout.** Narrower value boxes sized for what is typed (weight 5 characters, reps 3), smaller suggestion numbers, a pill-shaped tick, the RPE chip on the tick's own corner (no overlap), a gap between warm-ups and working sets. Warm-ups are automatic (see DECISIONS: `automaticWarmupCount`), and the exercise menu lost Add note, Targets, Rest time and the warm-up toggle.
- **Edit workout.** Save in the header; running totals (exercises, sets, warm-ups, average target RPE); W / 1 / 2 / D / F set labels; drag a card by its handle to reorder; the exercise name opens its page and back returns to the editor with the unsaved draft restored (`templateDraftStash`, `?restore=1`); rest accepts `120`, `90s`, `3m`, `2:00` (`parseRestDuration`); compact target cells.
- **Saved-workout preview.** No progression suggestions, names as accent text rather than underlined links, compact aligned cells.
- **History.** One `HistoryCard` (name, date, duration, volume, bests, then each exercise with its best set) on the History tab and a plan's History tab, from `workoutExerciseBests`.
- **Finish summary.** Stat tiles and cards (personal bests, exercises, comparison, exercise changes) instead of lines of text.
- Live exercise names opened from a workout return to that workout.

## Not done

- The History card shows the first five exercises ("+N more"); there is no infinite scroll.
- Dragging cards was checked with a mouse in the browser, not with a finger on a phone.
- The warm-up suggestion on exercises with no history waits for the first working weight to be typed.
