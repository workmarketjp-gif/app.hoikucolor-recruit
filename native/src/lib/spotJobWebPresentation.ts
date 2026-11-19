/**
 * Pure presentation helpers for the jobseeker Web /spot cards.
 * Web baseline: src/views/SpotJobsView.tsx, 2026-11-19.
 * This module never changes the canonical Spot RPC payload.
 */
export function formatSpotClosingAt(closingAt: string | null): string | null {
  if (closingAt === null) return null;
  const date = new Date(closingAt);
  // Do not invent a date or silently omit the Web's published closing field.
  if (Number.isNaN(date.getTime())) return '日時を確認できません';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(date);
}

export function spotRemainingSlotsLabel(availableCount: number): string {
  return `確定済みを除く残り ${availableCount}枠`;
}

export function spotEmptyJobsMessage(hasAssignments: boolean): string {
  return hasAssignments
    ? '確定済みの勤務は上の「あなたのスポット勤務」から確認できます。'
    : '新しい勤務枠が公開されると、ここに表示されます。';
}
