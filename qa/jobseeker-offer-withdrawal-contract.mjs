import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const withdrawalSql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260918170745_hc_jobseeker_withdrawal_terminal_authority_v1.sql'), 'utf8')
const offerSql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260918200145_hc_jobseeker_offer_acceptance_v1.sql'), 'utf8')
const repo = fs.readFileSync(path.join(root, 'src', 'lib', 'recruitRepository.ts'), 'utf8')
const detail = fs.readFileSync(path.join(root, 'src', 'components', 'ApplicationDetail.tsx'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src', 'components', 'ApplicationDetail.css'), 'utf8')

const requireMatch = (source, expression, message) => {
  if (!expression.test(source)) throw new Error(message)
}

requireMatch(withdrawalSql, /hc_jobseeker_withdraw_application/i, 'candidate withdrawal RPC migration missing')
requireMatch(withdrawalSql, /not in \('new',\s*'reviewing',\s*'interview',\s*'offered'\)/i, 'withdrawal RPC status guard changed; update WITHDRAWABLE_APPLICATION_STATUSES with it')
requireMatch(offerSql, /hc_jobseeker_accept_offer/i, 'candidate offer acceptance RPC migration missing')
requireMatch(offerSql, /status\s*<>\s*'offered'/i, 'offer acceptance must stay limited to offered applications')

requireMatch(repo, /rpc\('hc_jobseeker_accept_offer'/, 'frontend offer acceptance must use candidate-safe RPC')
requireMatch(repo, /rpc\('hc_jobseeker_withdraw_application'/, 'frontend withdrawal must use candidate-safe RPC')
requireMatch(repo, /WITHDRAWABLE_APPLICATION_STATUSES = \['new', 'reviewing', 'interview', 'offered'\]/, 'frontend withdrawable statuses must match the RPC guard')
requireMatch(repo, /HC_SPOT_APPLICATION_USE_SPOT_LIFECYCLE/, 'SPOT withdrawal refusal needs a plain-Japanese message')
requireMatch(repo, /candidate_offer_response\?: 'accepted' \| 'declined' \| null/, 'candidate offer response missing from application type')
if (/from\(['"]hc_applications['"]\)/.test(repo)) throw new Error('candidate decisions must not write hc_applications directly')

requireMatch(detail, /内定を承諾する/, 'candidate offer acceptance action missing')
requireMatch(detail, /辞退を確定する/, 'withdrawal must require an explicit confirmation step')
requireMatch(detail, /承諾を取り消して辞退する/, 'accepted offers must stay withdrawable')
requireMatch(detail, /maxLength=\{1000\}/, 'candidate decision message limit missing in UI')
requireMatch(css, /\.application-decision-card/, 'candidate decision styles missing')
requireMatch(css, /@media\(max-width:620px\)[\s\S]*application-decision-actions/, 'candidate decision mobile layout guard missing')
requireMatch(css, /\.application-decision-actions \{ display: grid; grid-template-columns: 1fr 1fr;/, 'offer accept and decline buttons must share one aligned row')
requireMatch(css, /\.application-withdraw-form > \.interview-response-actions \{ display: grid; \}/, 'withdraw confirm buttons must stay a grid; the reschedule-form flex row squeezes them on mobile')

console.log('jobseeker offer and withdrawal contract passed')
