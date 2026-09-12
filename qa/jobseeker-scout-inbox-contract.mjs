import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260912031500_hc_jobseeker_scout_inbox_v1.sql','utf8');
const notificationTypeMigration = fs.readFileSync('supabase/migrations/20260912032000_hc_jobseeker_scout_notification_type_v1.sql','utf8');
const repository = fs.readFileSync('src/lib/scoutInboxRepository.ts','utf8');
const panel = fs.readFileSync('src/components/ScoutInbox.tsx','utf8');
const vault = fs.readFileSync('src/components/DocumentVaultPanel.tsx','utf8');

function expect(condition,message){ if(!condition) throw new Error(message); }

expect(migration.includes('create table if not exists public.hc_scout_invitations'), 'scout invitation lifecycle table is required');
expect(migration.includes("recipient_clerk_user_id = auth.jwt()->>'sub'"), 'candidate scout reads must be current-user scoped');
expect(migration.includes('revoke all on table public.hc_scout_invitations from public, anon, authenticated'), 'candidate browsers must not directly access the scout table');
expect(migration.includes('hc_jobseeker_is_scoutable_for_org'), 'facility-side creation boundary must enforce opt-in and organization blocking');
expect(migration.includes("v_decision not in ('accepted','declined')"), 'candidate response must accept only explicit accept/decline decisions');
expect(migration.includes("v_row.expires_at<=now()"), 'expired scout invitations must not be accepted');
expect(migration.includes('hc_private.hc_accepted_scout_identity'), 'accepted scout identity consent boundary must exist');
expect(migration.includes("s.status='accepted' and s.organization_id=p_organization_id"), 'identity must only be available after acceptance and for matching organization');
expect(migration.includes('revoke all on function hc_private.hc_accepted_scout_identity'), 'identity helper must remain private');
expect(migration.includes("'scout_received'"), 'new scouts must generate a candidate notification');
expect(notificationTypeMigration.includes("'scout_received'::text"), 'notification type constraint must allow scout_received');
expect(repository.includes("rpc('hc_jobseeker_list_scouts')"), 'candidate inbox must use safe list RPC');
expect(repository.includes("rpc('hc_jobseeker_respond_scout'"), 'candidate response must use safe response RPC');
expect(panel.includes('承諾する') && panel.includes('辞退する'), 'candidate UI must support accept and decline');
expect(panel.includes('承諾するまで氏名・メール・電話番号は開示されません'), 'candidate UI must explain consent boundary');
expect(panel.includes('辞退した場合、氏名・連絡先は園へ共有されません'), 'decline confirmation must explain no identity sharing');
expect(vault.includes('<ScoutInbox />'), 'scout inbox must be reachable from the candidate profile');

console.log('jobseeker scout inbox contract: OK');
