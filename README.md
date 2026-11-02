# JEM

A workout tracker for the iPhone that works offline and keeps your training history on your phone. JEM is for lifters who want quick set logging and numbers backed by published research.

**Try it:** open <https://bader-almutlaq.github.io/JEM/> in Safari on an iPhone and add it to the Home Screen (see [Install](#install-on-an-iphone)).

## Why JEM

- **Your data stays on your phone.** No account, no server, no analytics and no ads. Your workouts live in the app's private storage on the phone. Nothing leaves it unless you connect your own Dropbox for backups.
- **It works offline, always.** Every feature works with no connection. JEM is a web app added to the Home Screen, so it never expires and needs no app store.
- **It measures; it doesn't prescribe.** JEM records what you did and calculates from it. Labels describe ("+12% vs 4-week average"); they never judge. Progression rules are optional and you define them.
- **Every number has a source.** Each analytics formula comes from the research summarised in [`reports/`](reports/), or is marked as a rule of thumb.

## Features

- **Logging:** last session's numbers shown beside each set, sets filled in for you, a large number pad with a kg/lb switch, automatic warm-ups, a rest timer, supersets, notes, and an "Is this right?" check before an unlikely number is saved.
- **Exercise library:** about 850 exercises with the muscles they train, other names, pictures, search that understands gym slang and typos, and your own exercises.
- **Plans:** folders of saved workouts, drag to reorder, targets per set, optional double progression and deloads. Start from a saved workout or repeat any past session.
- **History:** a list and a calendar, each workout compared with the last one and its personal bests, and editing of past workouts.
- **Analytics:** estimated one-rep max and its trend, hard sets and fractional sets per muscle, rep and effort mix, and long-range charts with a table view.
- **Body measurements:** circumferences and bodyweight, with change over time.
- **Import:** bring your history from Strong, FitNotes, Fitbod or Hevy CSV exports. A review step flags unlikely sets before anything is saved.
- **Export:** your workouts as a Strong-format CSV, and your measurements as CSV.
- **Backups:** a backup file in one tap, optional automatic backups to your own Dropbox, and restore. JEM keeps a safety copy of your current data before restoring.

## Install on an iPhone

1. Open **https://bader-almutlaq.github.io/JEM/** in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. From then on, open JEM from its Home Screen icon.

Deleting the Home Screen icon deletes the data on the phone. Back up from Settings now and then, or connect Dropbox so backups happen on their own.

**Updates** download in the background. When one is ready, JEM shows **Update ready**; tap it when you're not mid-workout. Nothing reloads on its own.

**Moving to a new phone, or reinstalling:** a new icon starts empty.

1. In the old app: Settings → Dropbox → **Back up to Dropbox now**, and check that the file is in Dropbox (Apps folder). Also tap **Back up now** to save a copy in Files.
2. Open the address in Safari and add it to the Home Screen. Keep the old icon until your data is back.
3. In the new app, the Workout tab shows **Restore your data**. Connect Dropbox (open Dropbox, then paste the code; if you use your own Dropbox app, paste its app key first) or pick the backup file, and confirm.
4. Check your workouts and plans, then delete the old icon.

## Privacy

The website only delivers the app itself; your data is never uploaded to it. Cloud backup is off until you connect your own Dropbox, and then JEM writes only to its own folder there. Details: [`docs/DATA.md`](docs/DATA.md).

## Run it yourself

You need [Node.js](https://nodejs.org/) 24 and `make`.

```bash
make install   # once, after cloning
make dev       # the app at http://localhost:5173, with live reload
make preview   # the production build, where offline mode works
make help      # every command
```

How the code is organised: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Rules for changing it: [`AGENTS.md`](AGENTS.md).

## Credits

Exercise data and pictures come from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (The Unlicense) and [everkinetic](https://github.com/everkinetic/data) (CC BY-SA 4.0). The app also shows these credits under Settings → Credits.
