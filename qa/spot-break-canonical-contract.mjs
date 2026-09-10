import fs from 'node:fs';

const migrationPath = 'supabase/migrations/20260910201500_hc_spot_break_minutes_canonical_v1.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');

const checks = [
  ['HO spot jobs own canonical break minutes', /alter table public\.ho_spot_job_drafts[\s\S]*add column if not exists break_minutes/i],
  ['HC jobs receive the public projection', /alter table public\.hc_jobs[\s\S]*add column if not exists spot_break_minutes/i],
  ['break values are bounded', /ho_spot_job_drafts_break_minutes_check[\s\S]*between 0 and 480/i],
  ['spot assignment rows reject non-canonical break values', /hc_spot_assignments_enforce_break_minutes/i],
  ['facility edit goes through an authenticated invoker RPC', /function public\.hc_set_spot_job_break_minutes[\s\S]*security invoker/i],
  ['anonymous callers cannot edit break minutes', /revoke all on function public\.hc_set_spot_job_break_minutes\(uuid, integer\) from public, anon/i],
  ['job seeker feed exposes canonical break minutes', /view public\.hc_jobseeker_job_feed[\s\S]*j\.spot_break_minutes/i],
  ['spot confirmation ignores client break and reloads HO canonical break', /hc_confirm_spot_assignment_canonical[\s\S]*select d\.break_minutes/i],
];

for (const [label, pattern] of checks) {
  if (!pattern.test(sql)) throw new Error(`Spot break contract failed: ${label}`);
}

console.log(`spot break canonical contract: ${checks.length} checks passed`);
