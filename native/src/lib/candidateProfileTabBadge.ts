type AttentionCounts = Readonly<{
  unread_messages_count: number;
  unanswered_interviews_count: number;
}>;

/**
 * Web CandidateShell's My Page badge counts unread messages and unanswered
 * interviews, not unread push notifications, pending scouts or all applications.
 * A missing/malformed canonical attention summary must not render a guessed 0.
 * The caller uses NotificationContext's candidate/lock-fenced attentionSummary.
 */
export function candidateProfileTabBadge(
  attention: AttentionCounts | null,
): { badge: number | string | undefined; accessibilityLabel: string } {
  const empty = { badge: undefined, accessibilityLabel: 'マイページ' };
  if (!attention) return empty;
  const messages = attention.unread_messages_count;
  const interviews = attention.unanswered_interviews_count;
  if (![messages, interviews].every((value) => Number.isSafeInteger(value) && value >= 0)) return empty;
  const total = messages + interviews;
  if (!Number.isSafeInteger(total) || total === 0) return empty;
  return {
    badge: total > 99 ? '99+' : total,
    accessibilityLabel: `マイページ、未確認 ${total} 件`,
  };
}
