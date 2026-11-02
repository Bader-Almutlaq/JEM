import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { SegmentedControl } from './SegmentedControl';
import styles from './SegmentedControl.module.css';

const options = [
  { value: 'a', label: 'One' },
  { value: 'b', label: 'Two' },
  { value: 'c', label: 'Three' },
] as const;

test('one sliding indicator is positioned from the selected index and animates only transform', () => {
  const html = renderToStaticMarkup(
    createElement(SegmentedControl<'a' | 'b' | 'c'>, {
      label: 'Range',
      options,
      value: 'c',
      onChange: () => undefined,
    }),
  );
  expect(html.match(new RegExp(`class="${styles.indicator}"`, 'g'))).toHaveLength(1);
  expect(html).toContain('--segment-index:2');
  expect(html).toContain('--segment-count:3');
  expect(html).toContain('aria-checked="true"');
  const css = readFileSync(new URL('./SegmentedControl.module.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.indicator \{[^}]*transition: transform/);
});

test('an unknown value hides the indicator instead of selecting the first segment', () => {
  const html = renderToStaticMarkup(
    createElement(SegmentedControl<string>, { label: 'Range', options, value: 'none', onChange: () => undefined }),
  );
  expect(html).toContain('data-empty="true"');
});
