import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260911054000_hc_spot_job_bridge_v1.sql'), 'utf8');

const checks = [
  [migration.includes("source_type='spot_job'"), 'HC spot jobs must be explicitly identified by source_type'],
  [migration.includes("v_spot.status='published'"), 'only an explicitly published Office spot source may publish'],
  [migration.includes("when 'cancelled' then 'closed'"), 'cancelled Office spot jobs must close in HC'],
  [migration.includes("when 'closed' then 'closed'"), 'closed Office spot jobs must close in HC'],
  [migration.includes("when 'archived' then 'archived'"), 'archived Office spot jobs must archive in HC'],
  [migration.includes('SPOT_WORK_DATE_AND_TIME_REQUIRED'), 'spot publication must require a work date and times'],
  [migration.includes('SPOT_HOURLY_RATE_REQUIRED'), 'spot publication must require a positive hourly rate'],
  [migration.includes('SPOT_SHORTAGE_NOT_OPEN'), 'linked resolved shortages must not be publishable'],
  [migration.includes("s.status in('ready','published')"), 'resolved shortages must close ready/published spot sources'],
  [migration.includes("when p_is_public then 'published' when s.status='published' then 'ready'"), 'the common HC ON/OFF switch must update the canonical Office spot source'],
  [migration.includes('revoke all on function hc_private.hc_sync_spot_job(uuid) from public,anon,authenticated'), 'private privileged spot sync must not be directly executable'],
  [migration.includes("employment_type='spot_job'") === false, 'spot UI label must not be confused with source_type implementation value'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('HC spot bridge contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}
console.log(`HC spot bridge contract passed (${checks.length} checks).`);
