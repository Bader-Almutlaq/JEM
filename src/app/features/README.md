# features

One folder per screen area. Each one composes small named components, forwards taps to `database.*` calls, and renders what comes back.

| Folder | Screens |
|---|---|
| [`workout/`](workout) | The Workout tab: start, log, rest timer, finish summary, restore on a fresh phone |
| [`history/`](history) | History list, calendar, workout detail and editing past workouts |
| [`exercises/`](exercises) | Browse, search, exercise pages and custom exercises |
| [`templates/`](templates) | Plans: folders, workouts, the template editor and plan analytics |
| [`analytics/`](analytics) | The Analytics tab and muscle detail |
| [`body/`](body) | Body measurements |
| [`import/`](import) | Import from Strong, FitNotes, Fitbod and Hevy |
| [`matching/`](matching) | Matching imported exercise names to library exercises |
| [`settings/`](settings) | Units, backup, Dropbox, export, credits |

Before adding a component, look in `../design/components` and in the sibling feature folders; several screens share pieces (for example the history card, exercise pickers and summary cards). Logic that is more than presentation belongs in `src/core`.
