import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260912020556_hc_jobseeker_scout_privacy_v1.sql'), 'utf8')
const fix = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260912020639_hc_jobseeker_scout_privacy_v1_fix_default.sql'), 'utf8')
const repo = fs.readFileSync(path.join(root, 'src', 'lib', 'scoutPrivacyRepository.ts'), 'utf8')
const panel = fs.readFileSync(path.join(root, 'src', 'components', 'ScoutPrivacyPanel.tsx'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src', 'components', 'ScoutPrivacyPanel.css'), 'utf8')
const vault = fs.readFileSync(path.join(root, 'src', 'components', 'DocumentVaultPanel.tsx'), 'utf8')

const requireMatch = (source, expression, message) => {
  if (!expression.test(source)) throw new Error(message)
}

requireMatch(sql, /create table if not exists public\.hc_jobseeker_privacy_settings/i, 'scout privacy settings table missing')
requireMatch(sql, /create table if not exists public\.hc_jobseeker_blocked_organizations/i, 'blocked organization table missing')
requireMatch(sql, /revoke all on table public\.hc_jobseeker_privacy_settings from anon, authenticated/i, 'privacy settings table must not be directly readable by candidates')
requireMatch(sql, /revoke all on table public\.hc_jobseeker_blocked_organizations from anon, authenticated/i, 'blocked organization table must not be directly readable by candidates')
requireMatch(sql, /m\.status\s*=\s*'active'/i, 'automatic current employer block must require active membership')
requireMatch(sql, /hc_jobseeker_is_org_blocked/i, 'organization blocking helper missing')
requireMatch(sql, /hc_jobseeker_is_scoutable_for_org/i, 'scout eligibility helper missing')
requireMatch(sql, /hc_jobseeker_anonymous_scout_snapshot/i, 'anonymous scout snapshot helper missing')
requireMatch(sql, /'desired_positions'/i, 'anonymous scout snapshot must include structured job preferences')

const anonymousFunction = sql.match(/create or replace function hc_private\.hc_jobseeker_anonymous_scout_snapshot[\s\S]*?\$\$;/i)?.[0] || ''
for (const forbidden of ["'name'", "'name_kana'", "'email'", "'phone'", "'self_intro'", "'clerk_user_id'"]) {
  if (anonymousFunction.includes(forbidden)) throw new Error(`anonymous scout snapshot leaks ${forbidden}`)
}

requireMatch(sql, /revoke all on function hc_private\.hc_jobseeker_anonymous_scout_snapshot\(text, uuid\) from public, anon, authenticated/i, 'private anonymous scout helper must not be browser callable')
requireMatch(sql, /revoke all on function public\.hc_jobseeker_get_scout_privacy\(\) from public, anon/i, 'scout privacy RPC anon revoke missing')
requireMatch(sql, /grant execute on function public\.hc_jobseeker_get_scout_privacy\(\) to authenticated/i, 'scout privacy authenticated grant missing')
requireMatch(fix, /coalesce\(\([\s\S]*scout_opt_in[\s\S]*\), false\)/i, 'scout opt-in default must be false when no settings row exists')

for (const rpc of [
  'hc_jobseeker_get_scout_privacy',
  'hc_jobseeker_set_scout_opt_in',
  'hc_jobseeker_search_blockable_organizations',
  'hc_jobseeker_add_blocked_organization',
  'hc_jobseeker_remove_blocked_organization',
]) requireMatch(repo, new RegExp(`rpc\\('${rpc}'`), `${rpc} is not wired in frontend repository`)

requireMatch(panel, /匿名スカウトを受け取る/, 'anonymous scout opt-in UI missing')
requireMatch(panel, /氏名・メール・電話番号・現在の勤務先を園へ公開しません/, 'candidate identity privacy explanation missing')
requireMatch(panel, /現在の勤務先として自動ブロック/, 'automatic current employer block UI missing')
requireMatch(panel, /手動ブロック/, 'manual organization block UI missing')
requireMatch(vault, /<ScoutPrivacyPanel\s*\/\>/, 'scout privacy panel is not connected to candidate profile')
requireMatch(css, /@media\(max-width:620px\)/, 'scout privacy mobile layout guard missing')

console.log('jobseeker scout privacy contract passed')
