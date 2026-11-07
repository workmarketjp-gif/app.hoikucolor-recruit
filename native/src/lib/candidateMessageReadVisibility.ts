/**
 * A message is not "read" simply because application detail was fetched.
 * The freshest facility message must be materially visible in the active
 * Native ScrollView before asking the existing authorized RPC to mark it read.
 * Positions are layout-relative, never screen/window coordinates.
 */
export type CandidateMessageReadViewport = Readonly<{
  facilityMessageId: string | null;
  measuredMessageId: string | null;
  sectionTop: number | null;
  messageTop: number | null;
  messageHeight: number | null;
  scrollY: number | null;
  viewportHeight: number | null;
}>;

export function visibleCandidateFacilityMessageId(view: CandidateMessageReadViewport): string | null {
  if (!view.facilityMessageId || view.measuredMessageId !== view.facilityMessageId) return null;
  const coordinates = [view.sectionTop, view.messageTop, view.messageHeight, view.scrollY, view.viewportHeight];
  if (coordinates.some((value) => value == null || !Number.isFinite(value))) return null;
  const [sectionTop, messageTop, messageHeight, scrollY, viewportHeight] = coordinates as number[];
  if (sectionTop < 0 || messageTop < 0 || messageHeight <= 0 || scrollY < 0 || viewportHeight <= 0) return null;
  const top = sectionTop + messageTop;
  if (!Number.isFinite(top)) return null;
  const visible = Math.max(0, Math.min(top + messageHeight, scrollY + viewportHeight) - Math.max(top, scrollY));
  // A single pixel of a bubble entering the viewport must not acknowledge it.
  return visible >= Math.min(56, messageHeight / 2) ? view.facilityMessageId : null;
}
