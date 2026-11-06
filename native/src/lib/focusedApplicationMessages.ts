/**
 * A /messages thread opens the canonical application detail with focus=messages.
 * Calculate the in-content scroll position only after both the message card and
 * ScrollView viewport/content have been laid out. Do not scroll another route
 * or repeat a focus jump after the candidate starts interacting with the page.
 * React Native's onLayout y here is relative to ScrollView content, not screen.
 */
export type FocusedApplicationMessagesGeometry = Readonly<{
  focused: boolean;
  alreadyFocused: boolean;
  anchorY: number | null;
  contentHeight: number;
  viewportHeight: number;
}>;

export function focusedApplicationMessagesOffset(geometry: FocusedApplicationMessagesGeometry): number | null {
  const { focused, alreadyFocused, anchorY, contentHeight, viewportHeight } = geometry;
  if (!focused || alreadyFocused || anchorY === null ||
      !Number.isFinite(anchorY) || !Number.isFinite(contentHeight) ||
      !Number.isFinite(viewportHeight) || anchorY < 0 ||
      contentHeight <= 0 || viewportHeight <= 0) return null;
  // Keep a small top inset for visual orientation, without overscrolling the
  // final section on short application pages and small phones.
  return Math.min(Math.max(0, contentHeight - viewportHeight), Math.max(0, anchorY - 12));
}
