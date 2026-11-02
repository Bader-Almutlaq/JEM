# library

The exercise library and everything about exercises themselves.

- `library.json` is the generated catalog (do not hand-edit; change the source mapping in `data/sources/` and run the builder in `tools/`). `LibraryFile`, `LibraryExercise` and `ExerciseLibrary` parse and validate it; `ExerciseLibrarySeeder` copies it into the database on launch.
- `Muscle`, `MuscleRegion`, `MuscleRole`, `MuscleProminence`, `Equipment`, `MovementPattern`, `Mechanic`, `ExerciseTracking`, `MachineBrands`: the taxonomy.
- `ExerciseSearch`, `SearchText`, `SearchVocabulary`, `GymSlang`: search with slang and typo tolerance. `SearchTuning` holds every score.
- `ExerciseNameResolver`: any name or alias to an exercise.
- `ExerciseEditor`, `CustomExerciseDraft`, `replaceExerciseMuscles`: creating, editing, archiving and merging exercises. The worker snapshots before a merge.
- `illustrations.json`: the reviewed mapping to exercise pictures.
