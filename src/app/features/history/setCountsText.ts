import { setCountText, warmupCountText } from '../../format/setText';

/** Formats work sets and, when present, their separate warm-up count. */
export function setCountsText(setCount: number, warmupCount: number): string {
  const warmups = warmupCount === 0 ? '' : ` · ${warmupCountText(warmupCount)}`;
  return `${setCountText(setCount)}${warmups}`;
}
