# T-088: Chart polish (bright callout, table pill, wider plots) and smoother touch

- **Milestone:** Analytics redesign, round 3 · **Depends on:** T-083 · **Model tier:** mid (Claude Sonnet subagent, written brief)
- **Runs in parallel with T-087** (owns `src/app/features/analytics/*`), **T-089** (owns `src/app/features/templates/*`, `src/app/features/workout/*`) and **T-091** (owns `src/app/data/*`, `src/worker/*`). You own `src/app/design/charts/*`, `src/app/design/components/*` (shared Button, SegmentedControl, Screen, BottomSheet…), `src/app/design/tokens.css`, `src/app/design/global.css` and `docs/DESIGN.md`. Don't edit feature folders.

## Goal

The owner tried the new charts on their iPhone (2026-11-02): press-and-drag works. Now:

1. **Callout colour:** the bubble is black-grey and doesn't stand out. Make it like Apple Fitness's: a filled accent (purple) bubble with high-contrast text, easy to read.
2. **"Show as table"** text under charts looks out of place ("too much text… every time I see 'show as table'"). Make it a small pill/tag aligned left with the page, compact.
3. **Plots waste side space.** "You're leaving too much space from the left and the right… increase so you can fit more, at least align it with the text." The plot area should run from the page's text inset to the right inset; y-axis labels sit inside the plot's left edge (over the gridlines, like Apple Health) rather than in a wide gutter.
4. **Smoothness:** "smooth transitions and smooth buttons and drag and drop". The app should feel responsive: instant press feedback on every button and row, no 300 ms delay, smooth sheet and screen transitions.

## Read first

- `AGENTS.md`, `docs/DESIGN.md` (Charts, motion if present), `src/app/design/tokens.css`.
- `src/app/design/charts/` (TimeChart, TimeChartCallout, TimeChartTable, TimeChartCanvas, chartScales, ChartFrame), `src/app/design/components/` (Button, SegmentedControl, BottomSheet, ActionMenu, Screen, BackLink).
- Reference: `.claude/worktrees/references/apple-fitness-chart-scrub.png` (from the main checkout: `../references/` relative to your worktree).

## Specification

1. **Callout:** background `--color-accent` (add a token `--color-callout` / `--color-on-callout` if needed, defined for dark and light), text in a colour with at least 4.5:1 contrast on it (check both themes; white on the dark-theme accent, and confirm the light theme). Date line bold, value line large (title size), series swatches become a white outline dot when the bubble is accent. Corner radius `--radius-medium`, a soft shadow. The ring on the selected point and the vertical rule use the accent.
2. **Table toggle:** replace the text button with a small pill (caption size, `--radius-small`, hairline border or subtle fill, about 28 px tall with a 44 px hit area) reading "Table", aligned to the chart's left edge, placed in the chart header row next to the expand icon if it fits, otherwise directly under the plot. Expanded view keeps its "Table" control in the same style.
3. **Plot width:**
   - Charts span the full content width (page insets only, no extra card padding around the plot).
   - Y-axis tick labels drawn inside the plot at its left edge, just above each gridline, in caption size and secondary ink; the unit stays on the top tick. Remove the left label gutter computation (`labelCharacterWidth` gutter) for inline charts; keep a small right padding so the last point's ring isn't clipped.
   - X-axis labels stay under the plot; first and last labels never clip.
   - Check every chart (exercise charts, workout/plan analytics, Analytics tabs, muscle page, measurements) still reads well; no label overlaps the line at 430 px (lines may pass behind labels; give labels a subtle background halo in the surface colour so they stay legible).
4. **Touch feedback and motion (shared components only):**
   - `touch-action: manipulation` on buttons, links and interactive rows globally (removes the double-tap delay), and `-webkit-tap-highlight-color: transparent` with our own `:active` state instead: a quick background or opacity change (≤ 100 ms) on Button, segmented control segments, list rows (a shared `pressable` class or token other features can adopt), chips, icon buttons.
   - Bottom sheets and dialogs: open with a 200–250 ms slide/fade (ease-out), close at ~150 ms; respect `prefers-reduced-motion` (no movement, just fade or instant).
   - Screen changes: use the View Transitions API where supported (Safari 18+ supports same-document view transitions) for push/back between routes with a short slide (≤ 250 ms), falling back to no animation; respect reduced motion. Keep it in one place (a small hook or router wrapper in `src/app/design/` or `src/app/navigation/`); do not touch feature screens beyond what the wrapper needs.
   - Segmented control: the selected pill slides between segments.
   - Keep everything at 60 fps on a phone: animate only `transform` and `opacity`.
5. Document the motion rules and the pressable pattern in DESIGN.md so feature tasks can adopt them.

## Acceptance criteria

- [ ] `make format`; `make verify` passes.
- [ ] Tests: callout uses the accent class; table toggle renders as a pill with accessible name "Show table"/"Hide table"; inline plot has no left gutter (left scale starts at the content edge, test via `chartScales`/model); reduced-motion disables transitions (CSS present under the media query); segmented control indicator element exists.
- [ ] DESIGN.md updated. Don't commit. No attribution or mention of tools/agents anywhere.

## Handoff

_Fill in at the end of the session._
