import {
  nativeAttentionInterviewHref,
  nativeAttentionMessageHref,
  type JobseekerAttentionSummary,
} from './attentionApi.ts';

/**
 * Web Home's actionable attention prompts, backed only by the current
 * authorized notification summary. A missing summary is unknown, never 0.
 * The existing application detail and inbox screens recheck ownership.
 */
export function homeAttentionActions(summary: JobseekerAttentionSummary | null): {
  interview: { count: number; href: string } | null;
  scout: { count: number; href: '/scouts' } | null;
  message: { count: number | null; href: string };
  applicationHref: '/(tabs)/applications';
} {
  const candidateMessageHref = summary?.next_message ? nativeAttentionMessageHref(summary) : null;
  return {
    interview: summary && summary.unanswered_interviews_count > 0
      ? { count: summary.unanswered_interviews_count, href: nativeAttentionInterviewHref(summary) }
      : null,
    scout: summary && summary.pending_scouts_count > 0
      ? { count: summary.pending_scouts_count, href: '/scouts' }
      : null,
    message: {
      count: summary?.unread_messages_count ?? null,
      // The Web sends candidates to the inbox if its next-message target is absent.
      // Never let an invalid/absent ID open an arbitrary application.
      href: candidateMessageHref?.startsWith('/application/') ? candidateMessageHref : '/messages',
    },
    applicationHref: '/(tabs)/applications',
  };
}
