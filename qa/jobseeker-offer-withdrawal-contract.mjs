import fs from 'node:fs';

const repository = fs.readFileSync('src/lib/applicationDecisionRepository.ts', 'utf8');
const panel = fs.readFileSync('src/components/ApplicationDecisionPanel.tsx', 'utf8');
const detail = fs.readFileSync('src/components/ApplicationDetail.tsx', 'utf8');
const withdrawalMigration = fs.readFileSync('supabase/migrations/20260918170745_hc_jobseeker_withdrawal_terminal_authority_v1.sql', 'utf8').toLowerCase();
const offerMigration = fs.readFileSync('supabase/migrations/20260918200145_hc_jobseeker_offer_acceptance_v1.sql', 'utf8').toLowerCase();

const checks = [
  ['offer acceptance uses the shared application RPC', repository.includes("client().rpc('hc_jobseeker_accept_offer'")],
  ['application withdrawal uses the shared application RPC', repository.includes("client().rpc('hc_jobseeker_withdraw_application'")],
  ['decision reads are actor-scoped through application detail RPC', repository.includes("client().rpc('hc_jobseeker_get_application_detail'")],
  ['client never writes hc_applications directly', !repository.includes("from('hc_applications')") && !repository.includes('.update(')],
  ['withdrawal is limited to server-supported normal application states', panel.includes("new', 'reviewing', 'interview', 'offered")],
  ['offered application exposes acceptance', panel.includes('内定を承諾') && panel.includes('acceptCandidateOffer')],
  ['offered application exposes decline through withdrawal RPC', panel.includes('内定を辞退') && panel.includes('withdrawCandidateApplication')],
  ['non-offer in-progress application exposes explicit withdrawal flow', panel.includes('辞退手続きを開く') && panel.includes('応募を辞退')],
  ['candidate sees accepted offer readback', panel.includes('内定を承諾済み') && panel.includes('candidate_offer_responded_at')],
  ['decision result refreshes application list/detail and attention surfaces', panel.includes("hc:applications-refresh") && panel.includes("hc:attention-refresh") && panel.includes("hc:notifications-refresh") && panel.includes("hc:messages-refresh")],
  ['application detail owns the decision surface', detail.includes('<ApplicationDecisionPanel applicationId={application.id}')],
  ['destructive decisions require explicit confirmation', panel.includes('window.confirm')],
  ['messages and reasons are capped at 1000 chars', panel.includes('maxLength={1000}') && repository.includes('length > 1000')],
  ['withdrawal migration derives candidate from JWT', withdrawalMigration.includes("v_actor text := nullif(auth.jwt() ->> 'sub', '')")],
  ['withdrawal migration only grants authenticated execute', withdrawalMigration.includes('grant execute on function public.hc_jobseeker_withdraw_application(uuid,text) to authenticated')],
  ['withdrawal migration cancels scheduled interviews and active visits', withdrawalMigration.includes("and i.status = 'scheduled'") && withdrawalMigration.includes("and r.status in ('requested', 'confirmed')")],
  ['offer migration requires offered status', offerMigration.includes("if v_app.status <> 'offered'") && offerMigration.includes('hc_offer_acceptance_not_allowed')],
  ['offer migration records accepted response and shared message', offerMigration.includes("candidate_offer_response = 'accepted'") && offerMigration.includes('perform public.hc_send_message')],
  ['offer migration only grants authenticated execute', offerMigration.includes('grant execute on function public.hc_jobseeker_accept_offer(uuid,text)') && offerMigration.includes('to authenticated')],
  ['application detail source exposes candidate offer readback', offerMigration.includes("'candidate_offer_response', a.candidate_offer_response") && offerMigration.includes("'candidate_offer_responded_at', a.candidate_offer_responded_at") && offerMigration.includes("'candidate_offer_message', a.candidate_offer_message")],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`);
if (failed.length) {
  console.error(`\n${failed.length} HC-W03 offer/withdrawal contract check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} HC-W03 offer/withdrawal contract checks passed.`);
