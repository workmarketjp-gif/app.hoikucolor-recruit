import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260912125500_hc_jobseeker_attention_summary_v1.sql', import.meta.url), 'utf8');
const repository = fs.readFileSync(new URL('../src/lib/attentionRepository.ts', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const applicationMessages = fs.readFileSync(new URL('../src/components/ApplicationMessages.tsx', import.meta.url), 'utf8');
const notification = fs.readFileSync(new URL('../src/components/NotificationCenter.tsx', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const shellCss = fs.readFileSync(new URL('../src/candidate-shell.css', import.meta.url), 'utf8');

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
  [repository.includes("rpc('hc_jobseeker_attention_summary')"), 'candidate client must read the narrow attention RPC'],
  [repository.includes("rpc('hc_jobseeker_mark_application_messages_read'"), 'message acknowledgement must use the ownership-checked RPC'],

  // Home is the single place that shows what needs attention (no injected dashboard/topbar widgets).
  [app.includes('getJobseekerAttentionSummary') && app.includes('unread_messages_count') && app.includes('unanswered_interviews_count') && app.includes('pending_scouts_count'), 'Home must show unanswered interviews, unread messages and pending scouts'],
  [app.includes('uuidPattern.test(nextInterview.application_id) && uuidPattern.test(nextInterview.interview_id)'), 'Home interview targets must validate application and interview UUIDs'],
  [app.includes('uuidPattern.test(attention.data.next_message.application_id)'), 'Home message targets must validate application UUIDs'],
  [app.includes("window.addEventListener('hc:attention-refresh', onRefresh)"), 'Home attention must refresh after reads and responses'],

  // Message read acknowledgement: only after the candidate opened the panel and messages loaded.
  [applicationMessages.includes("window.location.hash !== '#application-messages'"), 'message deep-link must auto-open the communication panel'],
  [applicationMessages.includes('load({ acknowledge: true })'), 'opening the communication panel must acknowledge only after loading messages'],
  [applicationMessages.includes('if (acknowledge) void acknowledgeMessages(next);'), 'acknowledgement must be driven by successfully loaded messages'],
  [applicationMessages.includes('markJobseekerApplicationMessagesRead(applicationId)'), 'acknowledgement must be bound to the application whose panel is open'],
  [applicationMessages.includes('acknowledgingRef.current = false;'), 'acknowledgement guard must be released so later messages can be acknowledged'],
  [applicationMessages.includes('acknowledgedMessageRef.current === newestFacilityMessage.id'), 'quiet refreshes must not re-acknowledge the same message (no needless RPCs)'],
  [!applicationMessages.includes('IntersectionObserver'), 'scrolling a closed communication card must not mark facility messages read'],
  [applicationMessages.includes("window.dispatchEvent(new CustomEvent('hc:notifications-refresh'))") && applicationMessages.includes("window.dispatchEvent(new CustomEvent('hc:attention-refresh'))"), 'message acknowledgement must refresh notifications and Home counts'],
  [notification.includes("window.addEventListener('hc:notifications-refresh'"), 'notification center must accept external message-read refreshes'],
  [notification.includes("new CustomEvent('hc:attention-refresh')"), 'notification reads must refresh dashboard attention counts'],
  [!main.includes('AttentionSummaryEnhancer') && !main.includes('Enhancer'), 'attention must not be injected by a global enhancer'],
  [shellCss.includes('.hc-stat-row') && shellCss.includes('.hc-todo-item'), 'Home attention rows must keep the shared mobile styles'],
];

for (const [ok, message] of checks) {
  if (!ok) throw new Error(message);
}

console.log('jobseeker attention summary contract: ok');
