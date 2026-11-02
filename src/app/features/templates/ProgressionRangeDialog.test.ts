import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ProgressionRangeDialog } from './ProgressionRangeDialog';

test('the missing-range prompt offers 8–12 for explicit confirmation and explains per-set targets', () => {
  const html = renderToStaticMarkup(createElement(ProgressionRangeDialog, { onSave: vi.fn(), onCancel: vi.fn() }));
  expect(html).toContain('Choose a rep range');
  expect(html).toContain('value="8"');
  expect(html).toContain('value="12"');
  expect(html).toContain('Use range');
  expect(html).toContain('optional target RPE');
});
