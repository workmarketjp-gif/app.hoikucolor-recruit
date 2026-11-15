/**
 * Web Home suppresses its attention statistics only when both independent
 * canonical reads succeeded AND every pending item is truly zero.
 * A loading, missing, failed or privacy-quarantined read is never a calm state.
 */
export type HomeCalmNavigationInput = {
  applicationCount: number | null;
  applicationLoading: boolean;
  applicationError: string | null;
  attentionSummary: {
    unread_messages_count: number;
    unanswered_interviews_count: number;
    pending_scouts_count: number;
  } | null;
  attentionLoaded: boolean;
  attentionLoading: boolean;
  attentionError: string | null;
};

export function canShowCalmHomeLinks(input: HomeCalmNavigationInput): boolean {
  if (input.applicationLoading || input.applicationError || input.applicationCount !== 0 ||
      !input.attentionLoaded || input.attentionLoading || input.attentionError || !input.attentionSummary) {
    return false;
  }
  return input.attentionSummary.unread_messages_count === 0 &&
    input.attentionSummary.unanswered_interviews_count === 0 &&
    input.attentionSummary.pending_scouts_count === 0;
}
