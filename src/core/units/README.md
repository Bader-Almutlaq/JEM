# units

Weight units and conversion. Weights are stored in kilograms exactly as entered, together with the unit they were typed in; conversion for display happens only in the UI layer, through this folder.

- `WeightUnit` and `Weight`: kg ↔ lb conversion, display rounding and original-unit inference.
- `LoadableWeight`: load ladders (plates, dumbbell steps, machine steps) and rounding to what can be loaded.
