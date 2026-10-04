import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');
const sql = read('supabase/migrations/20261004195823_hc_native_worker_runtime_v1.sql');
const push = read('supabase/functions/hc-native-push-dispatch/index.ts');
const deletion = read('supabase/functions/hc-native-account-deletion/index.ts');

const checks = [];
const check = (name, ok) => {
  checks.push(name);
  if (!ok) throw new Error(`HC_NATIVE_WORKER_RUNTIME_CONTRACT_FAILED: ${name}`);
};

check('requires Native push and deletion backend first', sql.includes('HC_NATIVE_WORKER_BACKEND_REQUIRED'));
check('runtime flags default to disabled', /enabled boolean not null default false/.test(sql) && (sql.match(/', false\)/g) || []).length === 2);
check('runtime table is not exposed to client roles', sql.includes('revoke all on table hc_private.native_worker_runtime from public, anon, authenticated, service_role;'));
check('worker secrets are generated in-database, never literal', sql.includes('vault.create_secret(\n        encode(extensions.gen_random_bytes(32), \'hex\')') && !/x-hc-worker-secret',\s*'[^']/.test(sql));
check('authorization RPC is service-role only', sql.includes('grant execute on function public.hc_native_worker_authorize_v1(text,text)\n  to service_role;') && !/hc_native_worker_authorize_v1\(text,text\)\s*to (anon|authenticated)/.test(sql));
check('authorization compares digests and returns only a boolean', sql.includes("extensions.digest(v_expected, 'sha256') = extensions.digest(p_secret, 'sha256')") && /returns boolean/.test(sql));
check('cron runner is a no-op unless enabled', sql.includes('if not found or not v_runtime.enabled then\n    return null;'));
check('cron runner disables itself if the secret is missing', sql.includes("last_error_code = 'WORKER_SECRET_MISSING'"));
check('cron runner is not callable by client roles', sql.includes('revoke all on function hc_private.run_native_worker_cron_v1(text)\n  from public, anon, authenticated, service_role;'));
check('both workers are scheduled through the runner', sql.includes("run_native_worker_cron_v1('push')") && sql.includes("run_native_worker_cron_v1('account_deletion')"));
check('push worker rejects non-POST', push.includes("request.method !== 'POST'"));
check('deletion worker rejects non-POST', deletion.includes("request.method !== 'POST'"));
check('workers never echo the supplied secret', !/x-hc-worker-secret'\)[^;]*JSON\.stringify/.test(push + deletion));
check('migration is transactional', /^begin;/m.test(sql) && /commit;\s*$/.test(sql));

console.log(`HC Native worker runtime contract passed (${checks.length}/${checks.length})`);
