import fs from 'node:fs';

const notification = fs.readFileSync(new URL('../src/components/NotificationCenter.tsx', import.meta.url), 'utf8');
const detail = fs.readFileSync(new URL('../src/components/ApplicationDetail.tsx', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260912120500_hc_jobseeker_selection_deep_links_v1.sql', import.meta.url), 'utf8');

const checks = [
  [migration.includes("&interview_id=' || new.id::text || '#interview-'"), 'interview notifications must include an exact interview deep link'],
  [migration.includes("'#application-messages'"), 'facility-message notifications must target the application message section'],
  [migration.includes('new.application_id::text'), 'interview notification must retain application identity'],
  [migration.includes('v_thread.application_id::text'), 'message notification must retain application identity'],
  [notification.includes("INTERVIEW_NOTIFICATION_TYPES"), 'notification router must explicitly gate interview notification types'],
  [notification.includes("UUID_PATTERN.test(item.application_id)"), 'application deep links must validate application UUIDs'],
  [notification.includes("UUID_PATTERN.test(interviewId)"), 'interview deep links must validate interview UUIDs'],
  [notification.includes("hash = '#application-messages'"), 'message notification navigation must use the safe message anchor'],
  [notification.includes("target.startsWith('/applications?')"), 'selection deep links must preserve query/hash navigation'],
  [detail.includes('interviews.some((item) => item.id === interviewId)'), 'application detail must reject interview IDs not belonging to the loaded application'],
  [detail.includes('id={`interview-${interview.id}`}'), 'interview cards must expose stable deep-link anchors'],
  [detail.includes('id="application-messages"'), 'communication panel must expose a stable deep-link anchor'],
  [detail.includes("target.scrollIntoView({ behavior: 'smooth', block: 'center' })"), 'deep-linked selection context must scroll into view'],
  [detail.includes('target.focus({ preventScroll: true })'), 'deep-linked selection context must receive keyboard focus'],
];

for (const [ok, message] of checks) {
  if (!ok) throw new Error(message);
}

console.log('jobseeker selection deep-link contract: ok');
