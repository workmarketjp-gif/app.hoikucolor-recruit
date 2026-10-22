/**
 * Presentation arithmetic for 転職シミュレーター. Market figures (median, quartiles, histogram,
 * scenario matches) are computed in SQL over the postings the job search shows and arrive
 * through careerRepository; nothing here samples, estimates or fills in a missing value.
 */
export type ScenarioId = 'keep-income' | 'more-holidays' | 'balance';

export type Bar = { from: number; to: number; count: number; containsYou: boolean };

/** Fewer postings than this get no median (mirrors the SQL threshold). */
export const minimumSampleSize = 5;

/**
 * Server bars plus the person's own pay: gaps between bars become empty bars so the scale is
 * honest, and a bar is added when the person's pay falls outside the posted range.
 */
export function withYourPosition(histogram: { from: number; to: number; count: number }[], you: number | null, binSize = 20000): Bar[] {
  if (!histogram.length) return [];
  const counts = new Map(histogram.map((bar) => [bar.from, bar.count]));
  const youBin = you === null ? null : Math.floor(you / binSize) * binSize;
  const starts = histogram.map((bar) => bar.from);
  const lowest = Math.min(...starts, youBin ?? Infinity);
  const highest = Math.max(...starts, youBin ?? -Infinity);
  const bars: Bar[] = [];
  for (let from = lowest; from <= highest; from += binSize) {
    bars.push({ from, to: from + binSize, count: counts.get(from) ?? 0, containsYou: youBin === from });
  }
  return bars;
}

/** Signed distance from the posted median in yen, or null without both numbers. */
export function differenceFromMedian(you: number | null, median: number | null): number | null {
  return you === null || median === null ? null : you - median;
}

export function formatMan(yen: number): string {
  return `${(yen / 10000).toFixed(1).replace(/\.0$/, '')}万円`;
}

/** 万円 text → yen. Empty, negative or non-numeric input is "not entered" (null), never 0. */
export function parseManYen(value: string): number | null {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) && number >= 0 && number <= 200 ? Math.round(number * 10000) : null;
}

export function parseDays(value: string): number | null {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) && number >= 0 && number <= 366 ? Math.round(number) : null;
}

/** The saved yen/day number back into the text field (23 not 23.0). */
export function manText(yen: number | null): string {
  return yen === null ? '' : String(yen / 10000);
}
