/**
 * Web CandidateShell exposes the notification bell from the candidate header.
 * The Native header uses only the current, unlocked candidate's canonical count.
 * Unknown, malformed or expired reads must not display a fabricated zero badge.
 */
export type CandidateNotificationHeaderDisclosure = Readonly<{
  accessibilityLabel: string;
  badgeText: string | null;
}>;

export function candidateNotificationHeaderDisclosure(
  unreadCount: number | null,
): CandidateNotificationHeaderDisclosure {
  if (unreadCount === null || !Number.isSafeInteger(unreadCount) || unreadCount < 0) {
    return { accessibilityLabel: '通知、未読件数を確認できません', badgeText: null };
  }
  if (unreadCount === 0) return { accessibilityLabel: '通知', badgeText: null };
  return {
    accessibilityLabel: `通知、未読${unreadCount}件`,
    badgeText: unreadCount > 99 ? '99+' : String(unreadCount),
  };
}
