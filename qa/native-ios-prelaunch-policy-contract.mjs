import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationPath = path.join(root, 'supabase/migrations/20261005074500_hc_native_ios_prelaunch_policy_v1.sql');
const alignedPath = path.join(root, 'supabase/migrations/20261005034946_hc_native_release_prelaunch_allowlist_v1.sql');
const stalePath = path.join(root, 'supabase/migrations/20261005090000_hc_native_release_prelaunch_allowlist_v1.sql');
const appPath = path.join(root, 'native/app.json');

const sql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n');
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));

const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);

check('history-aligned prelaunch migration exists before iOS seed', fs.existsSync(alignedPath));
check('stale prelaunch migration filename is absent', !fs.existsSync(stalePath));
check('Native iOS buildNumber is exactly 1', app?.expo?.ios?.buildNumber === '1');
check('iOS release row must not already exist', sql.includes('HC_IOS_RELEASE_POLICY_ALREADY_CONFIGURED'));
check('migration fails if reviewed Android baseline changed',
  sql.includes('HC_ANDROID_PRELAUNCH_BASELINE_CHANGED') &&
  sql.includes("platform='android'") &&
  sql.includes('minimum_build_number=1') &&
  sql.includes('latest_build_number=1') &&
  sql.includes('minimum_client_contract_version=1') &&
  sql.includes('backend_contract_version=1') &&
  sql.includes("release_state='prelaunch'") &&
  sql.includes('prelaunch_test_builds=array[1]::integer[]'));
check('migration inserts only the Hoiku Color iOS policy row',
  sql.includes('insert into hc_private.mobile_release_policy') &&
  sql.includes("'hoiku_color_jobseeker', 'ios', 1, 1, 1, 1") &&
  !/update\s+hc_private\.mobile_release_policy/i.test(sql) &&
  !/delete\s+from\s+hc_private\.mobile_release_policy/i.test(sql));
check('iOS is prelaunch and build 1 is explicitly allowlisted',
  sql.includes("null, false, null, now(), 'prelaunch', array[1]::integer[]"));
check('Store URL remains unset for internal QA', sql.includes('store_url is null'));
check('migration never switches release_state to active', !/['"]active['"]/i.test(sql));
check('migration never calls the public release-state switch', !sql.includes('hc_mobile_set_release_state_v1('));
check('migration does not grant broader database privileges', !/\bgrant\b/i.test(sql) && !/\brevoke\b/i.test(sql));
check('post-insert verification is fail-closed', sql.includes('HC_IOS_PRELAUNCH_POLICY_VERIFY_FAILED'));
check('migration is explicitly transactional', /^--[^\n]*\nbegin;/m.test(sql) && /\ncommit;\s*$/m.test(sql));

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
if (failed.length) {
  console.error(`Native iOS prelaunch policy contract failed (${checks.length - failed.length}/${checks.length}).`);
  process.exit(1);
}
console.log(`Native iOS prelaunch policy contract PASS (${checks.length}/${checks.length})`);
