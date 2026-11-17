/**
 * Match the existing JOBSEEKER Web application conversation metadata.
 * Web uses the viewer's local time zone, month/day and two-digit clock;
 * invalid timestamps are blank rather than exposing untrusted raw values.
 * This is display-only: the canonical message timestamp is unchanged.
 */
export function formatApplicationMessageWebTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Web renders the sender and timestamp together above the message body. */
export function applicationMessageWebMeta(senderRole: string, createdAt: string): string {
  const sender = senderRole === 'jobseeker' ? 'あなた' : '園';
  const dateTime = formatApplicationMessageWebTimestamp(createdAt);
  return dateTime ? `${sender} ・ ${dateTime}` : sender;
}
