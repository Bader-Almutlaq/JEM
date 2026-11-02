# logging

Writing a workout as it happens, and the rules that shape what is pre-filled.

- `WorkoutLogger`: the live workout and edits to finished ones (sets, notes, timing, positions).
- `WorkoutPreview`: what Start pre-fills from a template, previous values, deload stage and warm-ups.
- `WarmupPlan`: warm-up schemes and counts. `ProgressionPlan` and `ProgressionMode`: opt-in double progression. `DeloadPlan`: deload stages and reductions. `RestTimer`: defaults, limits, elapsed and remaining.

Progression is always opt-in and user-defined: the app suggests numbers, the owner decides.
