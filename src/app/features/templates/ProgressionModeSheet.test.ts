import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ProgressionModeSheet } from './ProgressionModeSheet';

test.each(['reps-first', 'weight-first'] as const)(
  'Automatic names its %s default without range inputs',
  (automaticMode) => {
    const html = renderToStaticMarkup(
      createElement(ProgressionModeSheet, {
        value: null,
        automaticMode,
        supportsLoad: true,
        onSave: vi.fn(),
        onCancel: vi.fn(),
      }),
    );
    expect(html).toContain(`Automatic (${automaticMode === 'weight-first' ? 'weight first' : 'reps first'})`);
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html).toContain('Reps first');
    expect(html).toContain('Weight first');
    expect(html).toContain('Off');
    expect(html).toContain('Targets…');
    expect(html).not.toContain('Minimum reps');
    expect(html).not.toContain('type="number"');
  },
);
test('bodyweight and timed sheets offer no load mode', () => {
  const html = renderToStaticMarkup(
    createElement(ProgressionModeSheet, {
      value: 'off',
      automaticMode: 'reps-first',
      supportsLoad: false,
      onSave: vi.fn(),
      onCancel: vi.fn(),
    }),
  );
  expect(html).not.toContain('Weight first');
  expect(html.match(/type="radio"/g)).toHaveLength(3);
});
