import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260913070000_hc_jobseeker_private_rpc_surface_hardening_v1.sql'),
  'utf8',
);

const checks = [
  [
    /create\s+or\s+replace\s+function\s+public\.hc_mark_notification_read[\s\S]*security\s+definer/i.test(migration),
    'single-notification public wrapper must be SECURITY DEFINER',
  ],
  [
    /create\s+or\s+replace\s+function\s+public\.hc_mark_all_notifications_read[\s\S]*security\s+definer/i.test(migration),
    'mark-all notification public wrapper must be SECURITY DEFINER',
  ],
  [
    /create\s+or\s+replace\s+function\s+public\.hc_request_visit[\s\S]*security\s+definer/i.test(migration),
    'visit-request public wrapper must be SECURITY DEFINER',
  ],
  [
    /create\s+or\s+replace\s+function\s+public\.hc_cancel_visit[\s\S]*security\s+definer/i.test(migration),
    'visit-cancel public wrapper must be SECURITY DEFINER',
  ],
  [
    /revoke\s+execute\s+on\s+function\s+ho_private\.hc_mark_notification_read_impl\(uuid\)\s+from\s+public,\s*anon,\s*authenticated/i.test(migration),
    'private single-notification implementation must not be browser-executable',
  ],
  [
    /revoke\s+execute\s+on\s+function\s+ho_private\.hc_mark_all_notifications_read_impl\(\)\s+from\s+public,\s*anon,\s*authenticated/i.test(migration),
    'private mark-all implementation must not be browser-executable',
  ],
  [
    /revoke\s+execute\s+on\s+function\s+hc_private\.request_visit\([^;]+\)\s+from\s+public,\s*anon,\s*authenticated/i.test(migration),
    'private visit-request implementation must not be browser-executable',
  ],
  [
    /revoke\s+execute\s+on\s+function\s+hc_private\.cancel_visit\(uuid\)\s+from\s+public,\s*anon,\s*authenticated/i.test(migration),
    'private visit-cancel implementation must not be browser-executable',
  ],
  [
    /grant\s+execute\s+on\s+function\s+public\.hc_mark_notification_read\(uuid\)\s+to\s+authenticated/i.test(migration),
    'authenticated candidate must retain the public single-notification RPC',
  ],
  [
    /grant\s+execute\s+on\s+function\s+public\.hc_request_visit\([^;]+\)\s+to\s+authenticated/i.test(migration),
    'authenticated candidate must retain the public visit-request RPC',
  ],
  [
    /revoke\s+execute\s+on\s+function\s+public\.hc_mark_notification_read\(uuid\)\s+from\s+anon/i.test(migration),
    'anon must not execute the candidate notification mutation RPC',
  ],
  [
    /revoke\s+execute\s+on\s+function\s+public\.hc_request_visit\([^;]+\)\s+from\s+anon/i.test(migration),
    'anon must not execute the candidate visit mutation RPC',
  ],
  [
    /JOBSEEKER_PRIVATE_HELPER_EXECUTE_REMAINS/.test(migration),
    'migration must fail closed if a private helper remains browser-executable',
  ],
  [
    /JOBSEEKER_PUBLIC_WRAPPER_AUTH_EXECUTE_MISSING/.test(migration),
    'migration must fail closed if candidate-safe public RPC access is accidentally removed',
  ],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('Jobseeker private RPC surface contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}

console.log(`Jobseeker private RPC surface contract passed (${checks.length} checks).`);
