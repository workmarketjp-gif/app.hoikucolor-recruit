import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260913060000_hc_jobseeker_core_table_privilege_hardening_v1.sql'),
  'utf8',
);

const checks = [
  [
    /revoke\s+truncate,\s*references,\s*trigger[\s\S]*public\.hc_jobseeker_profiles[\s\S]*from\s+anon,\s*authenticated/i.test(migration),
    'jobseeker profiles must revoke structural table privileges from anon/authenticated',
  ],
  [
    /revoke\s+truncate,\s*references,\s*trigger[\s\S]*public\.hc_saved_jobs[\s\S]*from\s+anon,\s*authenticated/i.test(migration),
    'saved jobs must revoke structural table privileges from anon/authenticated',
  ],
  [
    /has_table_privilege\('authenticated',\s*'public\.hc_jobseeker_profiles',\s*'TRUNCATE'\)/i.test(migration),
    'migration must fail closed if authenticated profile TRUNCATE remains',
  ],
  [
    /has_table_privilege\('authenticated',\s*'public\.hc_saved_jobs',\s*'TRUNCATE'\)/i.test(migration),
    'migration must fail closed if authenticated saved-job TRUNCATE remains',
  ],
  [
    !/revoke\s+(select|insert|update)[\s\S]*public\.hc_jobseeker_profiles/i.test(migration),
    'profile owner CRUD must remain available for the candidate app',
  ],
  [
    !/revoke\s+(select|insert|delete)[\s\S]*public\.hc_saved_jobs/i.test(migration),
    'saved-job owner CRUD must remain available for the candidate app',
  ],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('Jobseeker core table privilege contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}

console.log(`Jobseeker core table privilege contract passed (${checks.length} checks).`);
