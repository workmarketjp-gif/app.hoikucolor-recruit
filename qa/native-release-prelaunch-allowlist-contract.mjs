import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261005090000_hc_native_release_prelaunch_allowlist_v1.sql'), 'utf8').replace(/\r\n/g, '\n');

const checks = [];
const check = (name, ok) => {
  checks.push(name);
  if (!ok) throw new Error(`HC_NATIVE_PRELAUNCH_ALLOWLIST_CONTRACT_FAILED: ${name}`);
};

check('requires the release policy control plane', sql.includes('HC_NATIVE_RELEASE_POLICY_CONTROL_REQUIRED'));
check('new policies default to prelaunch', sql.includes("add column release_state text not null default 'prelaunch'"));
check('allowlist is bounded, non-null, positive and prelaunch-only', sql.includes('cardinality(prelaunch_test_builds) <= 20') && sql.includes('array_position(prelaunch_test_builds, null) is null') && sql.includes('1 <= all(prelaunch_test_builds)') && sql.includes("cardinality(prelaunch_test_builds) = 0 or release_state = 'prelaunch'"));
check('prelaunch blocks every build that is not explicitly listed', sql.includes("v_policy.release_state = 'prelaunch'\n    and not (p_build_number = any(v_policy.prelaunch_test_builds))") && sql.includes('and not v_prelaunch_blocked'));
check('listed builds still pass every other policy check', /not v_policy\.maintenance_mode\s+and not v_prelaunch_blocked\s+and not v_build_too_old\s+and not v_client_contract_too_old\s+and not v_backend_contract_too_old/.test(sql));
check('blocked prelaunch builds get a stable message', sql.includes("'APP_PRELAUNCH_BUILD_NOT_ALLOWED'"));
check('unconfigured platform stays fail-closed', sql.includes("'APP_RELEASE_POLICY_NOT_CONFIGURED'"));
check('bootstrap stays authenticated-only', sql.includes('grant execute on function public.hc_mobile_bootstrap_v1(text,integer,integer)\n  to authenticated;'));
check('allowlist and release-state switches are service-role only', ['hc_mobile_set_prelaunch_test_builds_v1(text,integer[])', 'hc_mobile_set_release_state_v1(text,text)'].every((fn) => sql.includes(`grant execute on function public.${fn}\n  to service_role;`) && !new RegExp(`${fn.replace(/[()[\]]/g, '\\$&')}\\s*to (anon|authenticated)`).test(sql)));
check('leaving prelaunch clears the allowlist', sql.includes("set release_state = p_release_state,\n         prelaunch_test_builds = '{}'::integer[]"));
check('no policy row is inserted or activated by the migration', !/insert\s+into\s+hc_private\.mobile_release_policy/i.test(sql) && !/release_state\s*=\s*'active'\s*,/.test(sql.replace(/release_state = 'active'\n/g, '')));
check('migration is transactional', /^begin;/m.test(sql) && /commit;\s*$/.test(sql));

console.log(`HC Native prelaunch allowlist contract passed (${checks.length}/${checks.length})`);
