import type { JobseekerApplicationSummary } from './applicationJourneyApi';
import type { JobseekerAttentionSummary } from './attentionApi';

const VALID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOSED_APPLICATION_STATUSES = new Set(['rejected', 'withdrawn', 'hired']);

const statusLabels: Readonly<Record<string, string>> = {
  new: '応募済み', applied: '応募済み', reviewing: '書類確認中',
  screening: '書類確認中', review: '確認中', interview: '面接予定',
  offered: '内定', offer: '内定', hired: '採用', rejected: '選考終了', withdrawn: '辞退',
};

/** Match the approved Web application labels across list, detail, and messages. */
export function applicationStatusLabel(status: string): string {
  return statusLabels[status] || status;
}

export type MessageInboxRow = {
  applicationId: string;
  facilityName: string;
  jobTitle: string;
  statusLabel: string;
  hasNewestUnread: boolean;
};

export type MessageInboxSnapshot = {
  rows: MessageInboxRow[];
  /** Null means the canonical attention read was not confirmed. Never display it as 0. */
  unreadCount: number | null;
  pendingScouts: number | null;
  newestApplicationId: string | null;
};

/**
 * Mirrors Web src/App.tsx MessagesView: the canonical application list is a thread
 * index; only the one application returned by the attention summary can say 新着.
 * A summary pointing outside that authorized application list is not navigable.
 * Neither a message count per application nor a read/delivery state is inferred.
 */
export function buildMessageInbox(
  applications: readonly JobseekerApplicationSummary[],
  attention: JobseekerAttentionSummary | null,
): MessageInboxSnapshot {
  const candidates = applications.filter((application) =>
    typeof application.id === 'string' && VALID_UUID.test(application.id));
  const allowed = new Set(candidates.map((application) => application.id));
  const safeCount = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
  const unreadCount = attention ? safeCount(attention.unread_messages_count) : null;
  const pendingScouts = attention ? safeCount(attention.pending_scouts_count) : null;
  const proposedId = attention?.next_message?.application_id;
  const newestApplicationId = unreadCount !== null && unreadCount > 0 &&
    typeof proposedId === 'string' && VALID_UUID.test(proposedId) && allowed.has(proposedId)
    ? proposedId : null;
  const timestamp = (value: string): number => {
    const result = Date.parse(value);
    return Number.isFinite(result) ? result : 0;
  };
  const sorted = [...candidates].sort((a, b) =>
    Number(CLOSED_APPLICATION_STATUSES.has(a.status)) - Number(CLOSED_APPLICATION_STATUSES.has(b.status)) ||
    timestamp(b.updated_at) - timestamp(a.updated_at));

  return {
    unreadCount,
    pendingScouts,
    newestApplicationId,
    rows: sorted.map((application) => ({
      applicationId: application.id,
      facilityName: application.facility_name || '園',
      jobTitle: application.job_title || '求人',
      statusLabel: applicationStatusLabel(application.status),
      hasNewestUnread: application.id === newestApplicationId,
    })),
  };
}
