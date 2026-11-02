# design

The design system. Visual rules are in [`docs/DESIGN.md`](../../../docs/DESIGN.md).

- `tokens.css`: colour, type, spacing, radius and motion tokens for dark and light. Components use these CSS variables only, through CSS modules.
- `global.css`: resets and base styles.
- [`components/`](components): shared screen pieces. **Look here before building a new one.**
- [`charts/`](charts): SVG chart building blocks.
- [`drag/`](drag), [`gestures/`](gestures): press-and-hold drag and swipe-down.
