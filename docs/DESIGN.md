# Design system

Inspired by Linear: calm, dense, precise. Designed dark-first, with a full light theme. By default it follows the phone's appearance setting; Settings → Appearance can force Dark or Light (`src/app/appearance/appearance.ts`, stored in `localStorage`). Near-black layered surfaces, hairline borders instead of shadows, one indigo accent, and a type scale that carries hierarchy without extra decoration. Numbers are the content, so they get the best typography.

Tokens live in `src/app/design/tokens.css` as CSS variables (`--color-surface`, `--font-headline`, `--space-l`…). Components use them through CSS modules, never raw colors, font sizes or paddings. Screens are designed at 430 × 932 (iPhone 15 Pro Max) and respect the safe areas (`env(safe-area-inset-*)`).

## Color tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `background` | `#08090A` | `#FBFBFC` | Screen background |
| `surface` | `#141516` | `#FFFFFF` | Cards, list rows |
| `surfaceRaised` | `#1C1D1F` | `#F4F5F7` | Active set row, sheets, pressed state |
| `border` | white 8% | black 8% | Hairline (0.5 pt) card and row borders |
| `borderStrong` | white 14% | black 14% | Focused input, selected chip |
| `textPrimary` | `#F7F8F8` | `#0B0C0E` | Values, titles |
| `textSecondary` | `#9EA1A8` | `#5A5E66` | Labels, previous-session values |
| `textTertiary` | `#62666D` | `#8A8F98` | Units, captions, axis labels |
| `accent` | `#7C85E8` | `#5E6AD2` | Primary action, selection, single-series lines |
| `accentSubtle` | accent 16% | accent 12% | Selected chip fill, completed-set row tint |
| `warmupRow` | `#30355E` | `#E7E9FB` | Full warm-up row; explicit accent-derived purple tint |
| `warmupLabel` | `#B6BDFF` | `#505BB8` | W label, brighter purple against the warm-up row |
| `suggestion` | `#F4BF50` | `#946000` | Optional amber value beside a set cell; tap to accept |
| `statusBad` | `#D03B3B` | `#D03B3B` | Failure-set F label (`--color-status-bad`) |

**Status** (always paired with an icon and a label, never color alone): good `#0CA30C`, warning `#FAB219`, serious `#EC835A`, critical `#D03B3B`.

## Typography

System font (`-apple-system`, which is SF Pro on the iPhone). Text inputs are 16 px so iOS doesn't zoom into them. Hierarchy comes from size and weight, never color alone.

| Style | Size / weight | Use |
|---|---|---|
| `display` | 34 / semibold, tight tracking | Hero number (e.g. current e1RM) |
| `title` | 22 / semibold | Screen titles |
| `headline` | 15 / semibold | Card titles, exercise names |
| `body` | 15 / regular | Default |
| `callout` | 13 / medium | Labels, chips |
| `caption` | 11 / medium, uppercase, +0.4 tracking | Section labels, axis titles |

All numbers in tables, set rows and axes use **monospaced digits** so columns align. Units sit beside the value in `textTertiary` (for example **102.5** kg).

## Units

- **Logging** shows each exercise in its own entry unit (kg or lb, remembered per exercise). What you did last time and what to load next appear in that unit. One tap on the number pad switches the exercise's unit; stored values never change.
- **Analytics** are always in kg, so every chart and total shares one scale. Touching a chart point reveals both units ("63.5 kg · 140 lb").
- Converted numbers use `Weight.displayValue(in:)`, so 61.23 kg reads as 135 lb, not 134.99.

## Spacing, shape, motion

- 4-pt grid: `xs 4, s 8, m 12, l 16, xl 24, xxl 32`. Screen side margin 16.
- Corner radius: 8 (rows, chips), 12 (cards), 16 (sheets).
- No drop shadows, except the chart readout bubble (`--shadow-callout`), which floats over the plot. Elsewhere elevation is a lighter surface plus a hairline border.
- Motion: 150–200 ms ease-out, no bounces (`--motion-standard`). No haptics: Safari on iOS has no vibration API. The full rules are under *Motion and touch* below.

## Motion and touch

Responsiveness is a feature: every tap answers at once, and nothing waits on an animation.

- **Pressable pattern.** Anything tappable (button, link row, chip, icon button, menu row, tab) darkens while pressed and eases back on release. The press is instant; the release takes `--motion-press` (90 ms, never over 100 ms). In a CSS module add `composes: pressable from global;` to the element's class; in plain markup use `className="pressable"`. The veil is an inset shadow of `--color-pressed` (a faint black or white), so it works on any background and corner radius and needs no per-component colour. Override `--color-pressed` locally when the fill is strong (the primary Button uses a darker veil). It is skipped on disabled controls. Do not write per-component `:active` colour changes.
- **No tap delay.** `global.css` sets `touch-action: manipulation` and a transparent tap highlight on links, buttons, labels, inputs and `role` button/radio/tab, at zero specificity, so a component that needs `pan-y` or `none` (chart plot, drag handle, swipe row) still wins by setting its own.
- **Sheets and dialogs.** Open with `--motion-open` (240 ms, ease-out): a bottom sheet slides up from the edge, a confirm dialog fades and scales from 96 %, the backdrop fades. Close in `--motion-close` (150 ms): `useAnimatedClose` marks the dialog `data-closing`, plays the exit, then runs the close action. `BottomSheet` closes this way on Escape and outside press; `ConfirmDialog` on Escape and its secondary button (the confirm action is never delayed). A parent that unmounts a dialog directly skips the exit.
- **Screen changes.** `ViewTransitionRouter` (`src/app/navigation/`) runs each route change inside a same-document view transition (Safari 18+): a push slides in from the right (old screen drifts left and fades), a way back slides from the left, and arriving at a tab root crossfades. 240 ms (`--motion-screen-duration`) at most. The tab bar has its own `view-transition-name`, so it stays still. Same-path changes (query or hash), `replace`, browsers without the API and reduced motion navigate with no animation. Back links call `backTransitionRequest.mark()` (done by `BackLink`) because they are pushes in the history. Because the update happens inside the transition, `navigate()` applies one frame later when animated.
- **Segmented control.** The selected pill is one element that slides between segments (`transform`, `--motion-open`).
- **Performance.** Animate only `transform` and `opacity` on anything large; the press veil and the colour changes on small controls are the only paint-only transitions. No layout-affecting properties, no animation on scroll.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, `global.css` makes every animation and transition instant, removes view-transition animations, and the router and dialogs skip their motion in script. New motion must work through those two switches: use CSS animations/transitions (covered by the media query) and `prefersReducedMotion()` for anything timed in script.

## Charts

Every dated plot uses `TimeChart` in `src/app/design/charts/`. Callers supply short titles, display-unit values (including nulls), series names, aggregation, and optional deload marks, regression and session navigation. Sparklines and non-time distributions retain their own forms.

- **Inline:** a 160 px plot, a title and an icon-only expand button with a 44 px target. No captions, takeaways, touch hints or persistent readout. Three or four round y ticks show the unit on the top tick only; three to five x labels name dates, including the year across years. Bars start at zero; level lines use a padded value domain.
- **Aggregation:** about 26 marks inline and 60 in landscape, using local days, Monday weeks, months and quarters. Close landscape zoom retains individual sessions, including separate sessions on one day. Numeric combination is delegated to `TimeBuckets` (max, mean, sum or last). No min–max bands. Visible windows clip observations before aggregation.
- **Gaps:** null-only periods have no mark and break a line. A gap longer than two missing calendar buckets also breaks a line. Missing observations are never replaced by zero.
- **Trend:** optional dashed straight regression fitted to shown non-deload observations by `LinearTrend` in WorkoutCore. Requires three valid observations and ends at the last fitted observation; it makes no forecast. In mixed buckets, regression uses only their non-deload source values.
- **Colour:** the first series always uses accent. Comparisons use the fixed categorical palette below, skipping yellow, which is reserved for deload. A point/bar is yellow only when all its source sessions are deloads. A legend appears for multiple series or a drawable trend, with named swatches and a dashed “Trend” key.
- **Plot width:** the plot runs from the page's text inset to the right inset (no card padding around it, no label gutter: `ChartLayout.padding.left` is 0, the right padding is 8 px so the last ring is not clipped). Value labels sit inside the plot at its left edge, just above their gridline, in caption size and secondary ink, drawn over the marks with a surface-coloured halo so a line passing behind stays legible. Gridlines span the full width and the SVG does not clip, so the first and last points sit exactly on the text edges. First and last date labels anchor inward (`axisLabelAnchor`) so they never clip.
- **Readout:** horizontal drag or a 150 ms press reveals a snapping vertical rule, ring and clamped bubble over the header. The bubble is an accent-filled (`--color-callout`, white `--color-on-callout` text, 4.7:1 in both themes; the dark theme keeps the light accent because white on the lighter dark accent is only 3.3:1) `--radius-medium` card with a soft shadow, a bold date/period line, a title-size value line with its unit, a white outline dot per series in place of the line swatch, and Deload where applicable. The rule and the selection ring use the same callout colour. Release/cancel clears it immediately. Vertical swipes inline scroll the page. Keyboard arrows inspect marks; blur/Escape clears the readout. Focus is visible only for keyboard use.
- **Expansion:** icon opens a modal full-screen landscape view. On an upright phone the whole view rotates clockwise 90°; physical touch coordinates map back to the logical plot. Padding remaps all safe-area insets with the rotation. It starts on the last six calendar months, with whole history available; charts on period-filtered pages load their full history on expansion. Pinch zooms between roughly two weeks and all history; one-finger drag pans, hold then drag inspects, double-tap resets to all history. A short session tap offers Open when a session callback exists. Close/Escape restores focus and page scrolling. No range chips.
- **Table:** inline data remains visually hidden and accessible to screen readers. Only the expanded header has a Table toggle; the visible table contains the current buckets and available session links. The toggle everywhere (`TablePill`, also used by `ChartTable` under distribution bars) is a small pill: caption size, `--radius-small`, hairline border on a raised fill, 28 px tall with a 44 px hit area, reading "Table" and named "Show table" or "Hide table" for screen readers. Under a chart it is left-aligned with the page text; there is no "Show as table" text button.
- **Rendering:** SVG in React, `d3-scale` for axes and straight `d3-shape` paths. Horizontal gridlines only, in border colour; axis text uses tertiary ink and tabular digits. One scale per chart; different measures get separate charts.
- **Volume per muscle:** horizontal bars retain their direct/indirect stack and evidence zones.

- **Categorical palette** (fixed order, never cycled; at most 3 series on scatter-type charts, at most 8 on lines and bars, and anything beyond folds into "Other"):

| Slot | Dark | Light |
|---|---|---|
| 1 blue | `#3987E5` | `#2A78D6` |
| 2 orange | `#D95926` | `#EB6834` |
| 3 aqua | `#199E70` | `#1BAF7A` |
| 4 yellow | `#C98500` | `#EDA100` |
| 5 magenta | `#D55181` | `#E87BA4` |
| 6 green | `#008300` | `#008300` |
| 7 violet | `#9085E9` | `#6250D6` |
| 8 red | `#E66767` | `#E34948` |

  This is the data-viz skill's reference palette, validated for color-vision deficiency on its own surfaces (`#1A1A19` dark, `#FCFCFB` light), which are close to ours. If any value changes, re-run the skill's validator against `#141516` and `#FFFFFF` (it needs Node.js).
- **Sequential (heatmaps, body map):** one blue ramp, light to dark: `#CDE2FB` … `#0D366B`.
- **Color follows the entity.** A muscle or lift keeps its color across every chart and filter.
- Non-time distributions retain their existing table control.

## Layout principles

- The workout logging screen is the most important screen. Last session's numbers sit inline on every set row. Logging a set takes 2–3 taps.
- One primary action per screen, in `accent`. Everything else is quiet.
- Prefer lists and tables over cards when comparing numbers.
- Empty states say what to do next in one line, with no illustrations.

## App icon

- Source: `design/app-icon.svg`. Render with `make icon` into `public/icon-192.png`, `public/icon-512.png` and `public/apple-touch-icon.png` (the Home Screen icon). Never edit the PNGs by hand.
- Concept: the end of a loaded barbell from the side. The plates grow left to right, so the mark also reads as a rising bar chart. It is the indigo accent on the near-black background, with no text.
- Graphics are drawn as SVG by agents. A design tool such as Figma isn't needed for marks this simple.

## Live workout

The sticky top bar keeps elapsed time and Finish visible. The session header shows its name,
a menu for rename/discard, local date and elapsed time. Each exercise name opens its exercise
page and uses the accent. An info line shows planned rep targets, saved rest targets and other existing exercise metadata;
session notes appear on a separate editable line and unset fields take no space. Rest targets are display metadata here; completing a set does not
open a rest timer.

Live rows use Set · Previous · kg/lb · Reps (or Time) · ✓, followed by Add set. RPE sits on an
independent badge at the check only when effort is logged. The number pad has an RPE key and quick picks; tapping a badge or holding the check for 500 ms also opens RPE. A hold
never completes a set. History editing retains its separate RPE column, notes and disabled check.

Untouched planned weight/reps stay greyed; completion accepts their already-saved values. Separate yellow deload and red progression suggestions are optional and only copied on tap. `ValueSuggestion` uses the cell's entry unit (seconds for timed cells). Generated
warm-ups use their existing planned values as suggestions; generation and protected-row rules
remain in WorkoutCore. Entered/accepted styling is local to the mounted editor; reopening safely
shows saved planned values as greyed again. Suggested warm-up identity after reload follows the
existing conservative core provenance rules.

Warm-ups use an amber tint on their individual rows. Set labels are W (amber), normal-set numbers, D (purple), F (red).
The menu lists only existing capabilities: session note, warm-ups, rest target, rep range, kg/lb,
move and remove. Sticky notes, replacement and superset editing have no live operation yet.

The live grid keeps weight and reps columns equal and aligns headings with the rows at 430 px.
Value boxes have 30 px visible height, 8 px corners and a 44 px touch area. Confirmation dialogs
space the title, optional message and stacked actions consistently. Plan cards show workout chips;
summary usage uses labelled tiles. Planned muscle tables separate direct and indirect columns and
place smaller muscles in a quieter expandable group. Progress rows label their estimate and comparison
columns, and pinned suggestions reserve card-sized positions while the owner pins them.
`--font-input: 400 16px/1.4 var(--font-family)` avoids Safari focus zoom in note inputs.


Measure uses grouped body-part rows with latest values on the right and separate + targets. Never-recorded parts appear only in Add body part; selecting one opens the existing log sheet and a first saved entry reveals it. Creating a custom part opens its page immediately for logging. Bodyweight is excluded from this navigation without changing its data. Body-part pages share the Chart · History segmented control; History includes both states, newest first.


## Plans and workouts

Visible wording uses **Plan** for a saved template folder, **Workout** for a saved template, and **Session** for a finished History entry. Storage and internal code names stay unchanged.

The Workout tab keeps Start empty workout first. Plans are separate navigation cards with a name, workout count, workout names and latest finished-session date; the card menu keeps rename, reorder and delete. Other workouts follow below. A plan opens `/workout/plans/:folderId`, with a Workout back link and management menu. Unknown/deleted ids return to Workout.

Plan pages use Workouts · History · Analytics. Workouts are ordered cards with an exercise summary, last done and management menu. Scheduled days appear as small yellow tags on cards and workout pages. + Workout opens the existing editor with that plan selected. History links every finished session in the current plan to History. Analytics shows plan duration, completed sessions per week against planned workouts, typical length, done versus planned muscle sets with exercise contributions, weekly hard sets and effort, then exercise progress grouped by workout.

Workout pages show a description, last done date, and Exercises · History · Analytics tabs. A Start this workout button stays above the tab bar and is disabled during an active workout. The Exercises tab previews the values Start would fill, without starting a session. Each exercise reuses the live header, yellow target info line, Set · Previous · kg/lb · Reps (or Time) headings and rows. Previous includes logged effort; starting values stay grey, with generated warm-up, progression and deload suggestions shown as numbers. There are no completion checks, number-pad inputs, menus, swipe deletion or Add set controls. Suggestion numbers stack beneath their values to fit four-digit weights. The Start button stays in its existing fixed footer. Exercise names still open workout-specific Progress and History. Plan workouts appear in a two-column card grid, collapsing below 360px.



## Exercise page (T-057)

Exercises open a Summary · History · Charts · Records · How-to segmented control. The `tab` URL parameter preserves the section through browser Back; unknown values open Summary. Each section mounts its own data query when opened. The five labels stay on one line with horizontal overflow on narrower displays, using the shared control and existing theme tokens.

Summary keeps primary/secondary muscle chips, equipment and traits, usage dates/counts, the existing smoothed e1RM headline, loading preferences and the existing Edit/actions. History shows finished sessions newest first, including repeated exercise entries and all completed set kinds with their recorded load, reps or seconds and RPE. Each session links to its History entry. Older/newer controls keep at most 200 sessions mounted.

For strength and bodyweight exercises, Charts now shares the Progress content described below. Timed tracking uses `TimeChart` for longest duration and, for loaded duration, top set weight.

Records show dated lifetime e1RM, heaviest load (with reps and recorded effort) and session volume. The 1–12-rep table uses the heaviest actual set achieving at least the row's reps, even without effort data. Predictions invert the canonical e1RM formula at RIR 0, from the best qualifying estimate, with shared estimate display rounding (0.5 kg / 1 lb); absent performances do not hide predictions. Unclassified exercises retain actual records but have no predictions. Reps and duration charts are the alternatives for unsupported weight records.

How-to defers the existing preference-controlled pictures until opened and retains bundled numbered instructions. Missing instructions read “No instructions for this exercise.”

## Deload (T-062)

The live exercise and workout menus offer **Deload this exercise** and **Deload whole workout** in
`--color-deload` (dark `#F4BF50`, light `#946000`, a legible yellow/ochre). A yellow **Deload · −20%**
chip on the exercise info line opens **End deload**. The percent is nominal, before loadable rounding;
bodyweight shows **Deload** without a load percentage. History shows a small noninteractive Deload tag.

Deload values occupy the existing amber suggestion slot in place of progression. The previous saved
values remain grey and ticking still uses them; only tapping amber or typing changes a value.
Entered and completed cells hide amber. Deload suggestions may reappear on reopening the editor,
including equal values; they remain opt-in. Timed rows do not suggest a rep value as seconds.

`TimeChart` accepts per-point deload flags or `{ date, kind: 'deload' }` marks. Wholly deload buckets use yellow marks in compact and expanded plots; mixed buckets keep the series colour. Callouts and table rows name Deload without a separate caption. Regression excludes deload source values.

### Analytics tab

Overview and Muscles share whole Monday-week period chips (4W, 12W, 6M, 1Y, All). Overview shows weekly totals and previous-period changes, the recent versus baseline card, workout frequency, and ranked lift trends. Deloads count in totals and are marked on frequency charts but excluded from lift trends. Muscles retains its week selector and uses the selected period for history.


The tab bar is Workout, Exercises, Measure, Analytics and Settings. The Workout header links to full History. Plan cards highlight during a held drag; a lifted label follows the finger.

Plan and plan-workout cards use a subtle card shadow in light mode and an inset top highlight in dark mode, alongside the existing border. Their options icon sits in a 32 × 28 px accent-tinted pill, within a larger touch target. Workout exercise summaries share one hairline-separated card; a separate tinted question-mark control opens the exercise in that workout.

Long-range chart axes use compact numbers by default. Session volume adds its unit, duration uses minutes or hours, and session counts use plain numbers. The y-axis reserves room for its widest formatted label; chart text has inner padding.

Set types use warm-up amber, failure red and drop purple with faint row tints; working sets remain plain. The workout editor uses compact value boxes within larger touch targets.

The Targets bottom sheet groups low and high values for reps, RPE and rest, with optional upper RPE and rest bounds. The editor shows previous completed performance alongside the editable targets; warm-ups and working sets are matched separately.

### Plan summary

The plan Summary lists planned fractional sets and weekly workout frequency, with untrained muscles muted and smaller muscles behind a toggle. Workout pages use the same rows without frequency. Weekday chips mark scheduled workouts, and the active plan uses the accent badge.


Live exercise metadata places the first planned working set's rep target and saved rest time in deload yellow under the name, with the deload chip aligned right; notes appear separately as an editable italic line. Template exercises show their saved rest and editable note in the same position. Live exercises form a continuous list with 24 px between exercises. Rows have 32 px visible boxes spaced 8 px apart, with a single filled Add set bar. Set-type tints remain on individual rows. Deload and progression suggestions sit beside their boxes in yellow and red respectively. The pad places hide, RPE, split minus/plus and Next in its right column, with RPE quick picks above the digits.

Live exercise metadata places the first planned working set's rep target and saved rest time in accent under the name; notes appear separately as an editable italic line. Template exercises show their saved rest and editable note in the same position. Compact set rows use 32 px visible value and completion boxes inside 44 px touch areas, with 4 px between visible boxes and a compact 36 px add-action row, preserving the set-type colours in both editors.

### Deload settings

Deload opens a bottom sheet from the exercise menu or yellow stage label, and the workout menu opens the whole-workout version. Weight, Sets and Both are segmented choices; steppers show the selected reduction and kept sets. The sheet uses the shared safe-area-aware bottom sheet and design tokens.


## Exercise Progress and RPE grid (T-077)

Exercise-in-workout pages open Progress · History, Progress first. The exercise's own Charts section uses the same content with By workout chips (All and saved workouts containing the lift). The recorded machine filter remains available. Three equal-width tiles fit at 430 px: smoothed e1RM now with four-session change, best e1RM with date, and the last session's top set with its before/after comparison. Values wrap inside tiles, never widen the page. Bodyweight additions keep “+”. Loads use the exercise's entry unit.

Five separate `TimeChart` plots show Estimated 1RM, Top set weight, Reps on the top set, Working sets and Average RPE. Working sets are bars; e1RM, top set and reps include a regression. Shared chart rules above govern aggregation, transient readouts, expansion, gaps and tables. There are no takeaways or deload explanations under the plots.

Compare days appears only inside a saved workout when other saved workouts contain the exercise. Up to two chips add independent lines to the e1RM plot. The first remains accent; comparison lines use the fixed orange and aqua palette values. Legend text uses ink with matching swatches.

Records places RPE chart below the rep-max table. The % / entry-unit control defaults to weights when a qualifying e1RM exists, otherwise %. Percent mode explicitly says “Guide: RTS chart, the same for every lift”; weight mode names the source e1RM and either the learned-set count or lift-type default. RPE rows descend 10–5 in half steps; reps 1–15 scroll horizontally within the screen. Row headers stay sticky on an opaque surface. Effective reps above 12 use muted text and a subtle raised-surface background, with a lower-reliability caption. Weights respect the lift's load ladder and appear in its entry unit; no estimate gives a readable empty state.


### Analytics dashboard (T-078)

The Analytics tab is one scrolling page: pinned lifts, active plan, period chips, overview tiles,
strength ranking, muscle table, then effort and rep distributions and separate weekly sets and
RIR charts. The muscle table opens a period-preserving detail page. Deload weeks are yellow;
charts provide dated readouts and table alternatives.


### Analytics polish (T-080)

Weekly sets and effort use the shared dated chart with unit-labelled axes, selection, deload marks and tables. Pinned suggestions wrap as touch-sized chips, and the active plan is a surface row. Signed strength changes use status colours, while zero is muted. Muscle rows link across the full row, with untrained muscles grouped below a divider.

### Workout and plan analytics (T-079)

Workout Analytics shows sessions, median length and last working sets against planned sets, followed by scoped exercise progress, per-session hard sets and logged effort. Plan muscle bars compare average completed fractional sets over available full weeks (up to four) with the planned weekly total; tapping a muscle opens its exercise contributions. Deloads are yellow and excluded from progress changes. Charts retain session or weekly dates, selection and tables.

Workout and plan Analytics use three equal-width, wrapping summary tiles. Session charts use the shared dated axes and touch selection, with a table and yellow deload points. Weekly chart headings stay short; their takeaway explains what each point represents. Plan muscle bars omit muscles with neither completed nor planned sets, and a tall primary-text tick marks planned sets in both the bar and legend. Exercise rows without an estimate show the latest top-set load and the comparison between four non-deload sessions ago and the latest non-deload session.

### Workout and plan analytics

Workout exercise cards place three compact trends side by side: estimated 1RM or top set, working sets, and RPE. Deload marks use the shared yellow token. Plan analytics reuse the muscles table and effort distributions for the recent plan window.

## Analytics navigation and strength

Analytics has a four-option segmented control below the title: Pinned, Overview, Muscles, Effort.
A single period-chip row follows it. Pinned cards fill the content width in a vertical list, leaving
room for long exercise names, the current estimate and a small trend. The Overview strength block
pairs a display-sized Typical lift percentage with three compact signed count chips. Neutral flat
counts use secondary ink; up/down use the existing signed colors and symbols. A 44-point info target
opens the shared bottom sheet. Strength index uses the existing TimeChart with percent units and trend.


## Automatic progression sheet (T-090)

The saved-workout exercise menu's Progression… action opens the shared safe-area-aware bottom sheet.
A touch-sized radio list offers Automatic (weight first) or Automatic (reps first), naming the current
core-resolved default, plus Reps first, Weight first and Off. Bodyweight and timed exercises omit Weight
first. Save changes only this workout occurrence's preference. Rep and RPE ranges stay in Targets…;
there are no duplicate range inputs. Explicit preferences have a muted editor label.

Live rows keep individually tappable red suggestion numbers beside the boxes. The metadata line
keeps targets/rest/machine/deload and contains no progression explanation or mode tag. Only the open
exercise options menu shows a tiny secondary-ink “+kg first” / “+reps first” caption. Off has no caption
or red values; active deload suggestions still replace progression. A position borrowing an exercise
range for its load rule exposes no reps suggestion. Completed and entered cells retain their existing
suppression behavior. Timed rows retain their existing numeric behavior.


## Restore on a fresh phone (T-095)

An empty Workout tab has one compact **Restore your data** surface above the start controls/empty saved-workout state. Use the existing surface, hairline, headline and spacing tokens with two quiet, full-width actions: **Restore from Dropbox** and **Restore from a file**. Hide the card once owner data exists; an unfinished workout also counts as data.

**Restore from Dropbox…** in connected Settings opens the shared bottom sheet. List the newest 30 exact backups by filename time, local date/time as the row title, file size below, and **Show older** for each further 30. Keep loading, empty, error and success states explicit. A row opens the same **Restore this backup?** confirmation as Files before downloading. Progress says **Downloading…**, then **Restoring…**; the result includes the workout count and safety-snapshot reminder. The sheet and confirmation inherit shared focus, scrolling, safe-area, motion and theme behavior.
