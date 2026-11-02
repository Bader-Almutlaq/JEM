import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const globalCss = readFileSync(new URL('./global.css', import.meta.url), 'utf8');

/** WCAG 2.x relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].toSorted((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

function token(name: string): string {
  const match = new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(tokens);
  if (match?.[1] === undefined) throw new Error(`Missing token ${name}`);
  return match[1];
}

test('callout text reaches 4.5:1 on the callout fill, in light and dark themes', () => {
  // The dark theme does not redefine the callout tokens, so one pair serves both themes.
  const darkBlock = tokens.slice(tokens.indexOf("[data-theme='dark']"));
  expect(darkBlock).not.toContain('--color-callout');
  expect(contrast(token('color-on-callout'), token('color-callout'))).toBeGreaterThanOrEqual(4.5);
});

test('every callout, accent text and surface pairing used by the bubble is defined', () => {
  for (const name of ['color-callout', 'color-on-callout', 'shadow-callout', 'color-pressed', 'motion-press']) {
    expect(tokens).toContain(`--${name}:`);
  }
});

test('press feedback is quick and touch delay is removed globally', () => {
  expect(globalCss).toContain('touch-action: manipulation');
  expect(globalCss).toContain('-webkit-tap-highlight-color: transparent');
  expect(globalCss).toMatch(/:where\(\.pressable:active/);
  expect(tokens).toMatch(/--motion-press: (\d+)ms/);
  expect(Number(/--motion-press: (\d+)ms/.exec(tokens)?.[1])).toBeLessThanOrEqual(100);
});

test('reduced motion disables animations, transitions and view transitions', () => {
  const block = globalCss.slice(globalCss.indexOf('@media (prefers-reduced-motion: reduce)'));
  expect(block).toContain('animation-duration: 0.01ms !important');
  expect(block).toContain('transition-duration: 0.01ms !important');
  expect(block).toContain('::view-transition-old(*)');
  expect(block).toContain('animation: none !important');
});

test('screen transitions animate only opacity and transform and stay within 250 ms', () => {
  expect(Number(/--motion-screen-duration: (\d+)ms/.exec(tokens)?.[1])).toBeLessThanOrEqual(250);
  const keyframes = [...globalCss.matchAll(/@keyframes route-[^{]+\{([\s\S]*?)\n\}\n/g)].map((match) => match[1] ?? '');
  expect(keyframes.length).toBeGreaterThanOrEqual(6);
  for (const frames of keyframes) {
    const properties = [...frames.matchAll(/^\s+([a-z-]+):/gm)].map((match) => match[1]);
    for (const property of properties) expect(['opacity', 'transform']).toContain(property);
  }
});
