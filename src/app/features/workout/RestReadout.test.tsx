import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { RestReadout } from './RestReadout';

test('shows time past the low target during a rest range', () => {
  const html = renderToStaticMarkup(
    createElement(RestReadout, {
      model: {
        state: { elapsedSeconds: 140, remainingSeconds: 0, isTargetReached: true },
        targetSeconds: 120,
        range: { phase: 'between', overtimeSeconds: 20 },
        canShorten: true,
        canLengthen: true,
        shorten: vi.fn(),
        lengthen: vi.fn(),
        dismiss: vi.fn(),
      },
    }),
  );
  expect(html).toContain('+0:20');
});
