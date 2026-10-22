// 転職シミュレーター data contract: SQL text checks (no database needed), same style as the other
// *-database-contract files. Guards population, privilege surface, owner scoping and "no estimates".
import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20261023090000_hc_jobseeker_career_market_v1.sql', 'utf8');
const doc = fs.readFileSync('docs/career-data-contract.md', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`jobseeker-career-market-database-contract: ${message}`);
    process.exit(1);
  }
}

const code = sql.replace(/^\s*--.*$/gm, '');

assert(/begin;[\s\S]*commit;/.test(code), 'migration must be one transaction');
assert(code.includes('hc_jobseeker_job_feed') && code.includes('hc_external_job_public_feed'), 'population must be exactly what job search shows');
assert(!code.includes('hc_external_job_sources') && !code.includes('source_payload'), 'unpublished / blocked source rows must never be aggregated');
assert(!/holidays\s*~|regexp|substring\s*\(|similar to/i.test(code), 'annual holidays must not be parsed in SQL; B owns the verified column');
assert(/null::integer,\s*null::text/.test(code), 'annual holidays stay NULL until B replaces the helper');
assert(!/title\s*(~|like|ilike)|description\s*(~|like|ilike)/i.test(code), 'occupation must not be guessed from title/description');
assert(code.includes('percentile_cont') && code.includes('between 100000 and 1000000'), 'median/quartiles over plausible monthly lower bounds');
assert(code.includes("'monthly_lower_bound'") && /n >= 5/.test(code), 'too few postings must not produce a median');
assert(code.includes("'coverage'"), 'per-prefecture coverage must be reported');

// Every exposed function: authenticated only, never anon / service_role, identity from the JWT.
const publicFns = [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
assert(publicFns.length === 5, `unexpected public RPC count ${publicFns.length}`);
for (const name of publicFns) {
  assert(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated, service_role;`).test(code), `${name}: must revoke from public/anon/service_role`);
  assert(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated;`).test(code), `${name}: must grant only to authenticated`);
}
assert((code.match(/nullif\(\(select auth\.jwt\(\)\) ->> 'sub', ''\)/g) ?? []).length >= 5, 'identity must come from the JWT sub');
assert((code.match(/HC_JOBSEEKER_AUTH_REQUIRED/g) ?? []).length >= 5, 'every RPC must require a signed-in candidate');
assert(!/p_clerk_user_id|p_user_id|p_actor/.test(code), 'RPCs must never accept a caller-supplied identity');
assert(code.includes('revoke all on function hc_private.career_posted_jobs_v1()'), 'private helper must not be callable by browser roles');

// Saved conditions: RLS, owner-only select, RPC-only writes, deletion freeze, no duplicated preferences.
assert(code.includes('alter table public.hc_jobseeker_career_conditions enable row level security'), 'RLS must be enabled');
assert(code.includes('grant select on table public.hc_jobseeker_career_conditions to authenticated') && !/grant (insert|update|delete)/.test(code), 'browser roles may only read their own row');
assert(code.includes("using (clerk_user_id = nullif(((select auth.jwt()) ->> 'sub'), ''))"), 'select policy must be owner-scoped');
assert(code.includes('hc_candidate_owned_row_account_freeze_v1') && code.includes('on delete cascade'), 'account deletion must erase and freeze these rows');
assert(code.includes('assert_jobseeker_mutation_allowed_v1'), 'writes must respect the account-deletion freeze');
assert(!/desired_monthly_salary_min|desired_prefectures/.test(code.split('hc_jobseeker_career_conditions (')[1] ?? ''), 'preferences already stored in the profile must not be duplicated');
assert(!/security invoker|disable row level security|grant all|\bto (anon|public)\b/i.test(code), 'no privilege loosening');

// The written contract must keep the three sources apart and name the B-owned fields.
assert(doc.includes('official_wage_stats') && doc.includes('posted_salary') && doc.includes('own_salary'), 'doc must define the three separate metrics');
assert(doc.includes('annual_holidays_days') && doc.includes('annual_holidays_basis') && doc.includes('occupation_group'), 'doc must define the B-owned fields');
assert(doc.includes('掛け合わせ') && doc.includes('禁止'), 'doc must forbid crossing region and experience statistics');

console.log('jobseeker-career-market-database-contract: PASS');
