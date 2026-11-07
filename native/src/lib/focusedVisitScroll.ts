/**
 * Centre an exact, already-authorized visit deep-link inside a React Native ScrollView.
 * Section top is relative to the ScrollView content; card top is relative to its section.
 * Returning null prevents jumping before the native layout is fully measured.
 */
export type FocusedVisitMeasurements = {
  sectionTop: number | null;
  cardTop: number | null;
  cardHeight: number | null;
  viewportHeight: number | null;
  contentHeight: number | null;
};

export function focusedVisitScrollY(measure: FocusedVisitMeasurements): number | null {
  const values = [measure.sectionTop, measure.cardTop, measure.cardHeight, measure.viewportHeight, measure.contentHeight];
  if (values.some((value) => value == null || !Number.isFinite(value))) return null;
  const [sectionTop, cardTop, cardHeight, viewportHeight, contentHeight] = values as number[];
  if (sectionTop < 0 || cardTop < 0 || cardHeight <= 0 || viewportHeight <= 0 || contentHeight <= 0) return null;
  const absoluteTop = sectionTop + cardTop;
  if (absoluteTop + cardHeight > contentHeight + 1) return null;
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  return Math.max(0, Math.min(maxScroll, absoluteTop + cardHeight / 2 - viewportHeight / 2));
}
