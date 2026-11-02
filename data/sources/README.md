# sources

- `free-exercise-db/` and `everkinetic/`: pinned copies of the upstream exercise data (each has a `SOURCE.md` with the commit and licence). Pictures are loaded on demand from the pinned commits, not copied.
- `library-mapping.json`: the reviewed decisions that turn those sources into JEM's exercise families, with stable ids.
- `illustration-mapping.json`: which picture belongs to which exercise.

Change the mappings, then re-run the builders in [`tools/`](../../tools). Don't edit the generated `library.json` by hand. Credits are shown in the app under Settings → Credits.
