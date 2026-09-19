import fs from 'node:fs';

const repository = fs.readFileSync('src/lib/applicationDecisionRepository.ts', 'utf8');
const panel = fs.readFileSync('src/components/ApplicationDecisionPanel.tsx', 'utf8');
const detail = fs.readFileSync('src/components/ApplicationDetail.tsx', 'utf8');

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
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`);
if (failed.length) {
  console.error(`\n${failed.length} HC-W03 offer/withdrawal contract check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} HC-W03 offer/withdrawal contract checks passed.`);
