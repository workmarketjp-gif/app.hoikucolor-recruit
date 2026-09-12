import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260912125500_hc_jobseeker_attention_summary_v1.sql', import.meta.url), 'utf8');
const repository = fs.readFileSync(new URL('../src/lib/attentionRepository.ts', import.meta.url), 'utf8');
const enhancer = fs.readFileSync(new URL('../src/components/AttentionSummaryEnhancer.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/components/AttentionSummaryEnhancer.css', import.meta.url), 'utf8');
const notification = fs.readFileSync(new URL('../src/components/NotificationCenter.tsx', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

const checks = [
  [migration.includes('ho_private.current_clerk_user_id()'), 'attention summary must bind every count to the current Clerk user'],
  [migration.includes("i.status = 'scheduled'"), 'only scheduled interviews may count as unanswered'],
  [migration.includes('r.interview_id is null'), 'an interview with a candidate response must not count as unanswered'],
  [migration.includes("n.notification_type = 'message_received'"), 'unread message count must be scoped to facility-message notifications'],
  [migration.includes('n.read_at is null'), 'unread message count must exclude already-read messages'],
  [migration.includes("s.status = 'pending'"), 'scout attention must include only pending scouts'],
  [migration.includes('s.expires_at > now()'), 'expired scouts must not count as pending attention'],
  [migration.includes('revoke all on function public.hc_jobseeker_attention_summary() from public, anon'), 'anon must not execute the attention summary RPC'],
  [migration.includes('grant execute on function public.hc_jobseeker_attention_summary() to authenticated, service_role'), 'authenticated candidates must use the narrow attention summary RPC'],
  [migration.includes('a.jobseeker_clerk_user_id = v_actor'), 'message-read acknowledgement must verify application ownership'],
  [migration.includes("n.notification_type = 'message_received'"), 'message acknowledgement must not mark unrelated notification types read'],
  [repository.includes("rpc('hc_jobseeker_attention_summary')"), 'candidate client must read the narrow attention RPC'],
  [repository.includes("rpc('hc_jobseeker_mark_application_messages_read'"), 'message acknowledgement must use the ownership-checked RPC'],
  [enhancer.includes('UUID_PATTERN.test(item.application_id)'), 'attention interview targets must validate application UUIDs'],
  [enhancer.includes('UUID_PATTERN.test(item.interview_id)'), 'attention interview targets must validate interview UUIDs'],
  [enhancer.includes("UUID_PATTERN.test(scoutId)"), 'attention scout targets must validate scout UUIDs'],
  [enhancer.includes("document.getElementById('application-messages')"), 'message read state must be acknowledged from the visible communication panel'],
  [enhancer.includes("entry.intersectionRatio >= 0.25"), 'message notifications must not be marked read before the communication panel is materially visible'],
  [enhancer.includes("window.dispatchEvent(new CustomEvent('hc:notifications-refresh'))"), 'message acknowledgement must refresh the notification center'],
  [notification.includes("window.addEventListener('hc:notifications-refresh'"), 'notification center must accept external message-read refreshes'],
  [notification.includes("new CustomEvent('hc:attention-refresh')"), 'notification reads must refresh dashboard attention counts'],
  [main.includes('<AttentionSummaryEnhancer />'), 'attention summary enhancer must be mounted globally'],
  [css.includes('@media(max-width:420px)'), 'attention summary must keep an explicit narrow-mobile layout'],
];

for (const [ok, message] of checks) {
  if (!ok) throw new Error(message);
}

console.log('jobseeker attention summary contract: ok');
