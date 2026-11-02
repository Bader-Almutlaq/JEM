# components

Shared UI pieces. Check this list before writing a new component; extend one if it almost fits.

- **Layout:** `Screen`, `Section` / `SectionRow`, `TabBar`, `BackLink`, `BackButton`, `HeaderLink`, `EmptyState`
- **Actions:** `Button`, `LinkButton`, `LinkRow`, `ActionMenu`, `SwipeToDelete`
- **Overlays:** `BottomSheet`, `ConfirmDialog` (use it instead of `window.confirm`), `ErrorBanner`, `UpdateBanner`
- **Inputs:** `TextField`, `SelectField`, `SearchField`, `CheckboxField`, `SegmentedControl`, `Chip`, `SelectChip`, `ToggleChip`

Style with design tokens only (`../tokens.css`). One component per file, named after the file.
