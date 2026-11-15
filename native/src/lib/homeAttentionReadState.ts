/**
 * Web Home treats its attention-summary read independently from the notification
 * center's list and unread-badge count. NotificationContext may have a valid,
 * owner-pinned attention summary AND a warning for a failed badge count.
 * That unrelated warning must not hide a genuinely calm Home or trigger a
 * message-row retry in place of navigation. An absent summary remains unknown.
 */
export type HomeAttentionReadState = Readonly<{
  loaded: boolean;
  error: string | null;
}>;

export function homeAttentionReadState(
  attentionSummary: object | null,
  notificationWarning: string | null,
): HomeAttentionReadState {
  return attentionSummary === null
    ? { loaded: false, error: notificationWarning }
    : { loaded: true, error: null };
}
