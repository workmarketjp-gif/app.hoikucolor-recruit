import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const bundle = [
  'supabase/migrations/20260919053000_hc_native_mobile_foundation_v3.sql',
  'supabase/migrations/20260919063000_hc_native_mobile_idempotency_v5.sql',
  'supabase/migrations/20260919073000_hc_native_push_pipeline_v4.sql',
  'supabase/migrations/20260919093000_hc_native_account_deletion_v3.sql',
  'supabase/migrations/20260919103000_hc_native_account_deletion_write_freeze_v1.sql',
  'supabase/migrations/20260919114500_hc_native_account_deletion_push_quarantine_v1.sql',
  'supabase/migrations/20260920054000_hc_native_release_policy_control_v1.sql',
];

const checks = [];
const check = (name, ok) => {
  checks.push([name, Boolean(ok)]);
  if (!ok) throw new Error(`FAIL: ${name}`);
};

for (const file of bundle) check(`bundle file exists: ${file}`, fs.existsSync(path.join(root, file)));
const stamps = bundle.map((file) => Number(path.basename(file).slice(0, 14)));
check('bundle migration timestamps are strictly increasing', stamps.every((v, i) => i === 0 || v > stamps[i - 1]));

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const foundation = read(bundle[0]);
const idempotency = read(bundle[1]);
const push = read(bundle[2]);
const deletion = read(bundle[3]);
const freeze = read(bundle[4]);
const quarantine = read(bundle[5]);
const policy = read(bundle[6]);

check('foundation owns isolated HC installation and release policy only',
  foundation.includes("check (app_key = 'hoiku_color_jobseeker')") &&
  foundation.includes('create table hc_private.mobile_installations') &&
  foundation.includes('create table hc_private.mobile_release_policy'));
check('foundation leaves release policy unseeded and bootstrap fail-closed',
  foundation.includes("'APP_RELEASE_POLICY_NOT_CONFIGURED'") &&
  !/insert\s+into\s+hc_private\.mobile_release_policy/i.test(foundation));
check('idempotency delegates canonical message and visit mutations',
  idempotency.includes('v_message := public.hc_send_message(') &&
  idempotency.includes('v_id := public.hc_request_visit('));
check('push requires foundation instead of creating another installation model',
  push.includes('HC_NATIVE_MOBILE_FOUNDATION_REQUIRED') &&
  !/create table hc_private\.mobile_installations/i.test(push));
check('account deletion retains current owner-immutability preflight',
  deletion.includes('HC_ACCOUNT_DELETION_OWNER_GUARD_DRIFT') &&
  deletion.includes('HC_CANDIDATE_APPLICATION_OWNER_IMMUTABLE'));
check('shared-identity freeze requires deletion v3 and mobile foundation',
  freeze.includes('HC_ACCOUNT_DELETION_V3_REQUIRED') &&
  freeze.includes("to_regclass('hc_private.mobile_installations')"));
check('push quarantine requires both deletion freeze and push pipeline',
  quarantine.includes('HC_NATIVE_ACCOUNT_DELETION_PUSH_BASELINE_MISSING') &&
  quarantine.includes("to_regprocedure('hc_private.jobseeker_account_is_frozen_v1(text)')") &&
  quarantine.includes("to_regprocedure('public.hc_mobile_claim_push_batch_v1(text,integer)')"));

check('release policy control requires foundation and never seeds policy',
  policy.includes('HC_NATIVE_RELEASE_POLICY_FOUNDATION_REQUIRED') &&
  policy.includes('This migration intentionally DOES NOT insert or activate a release policy.'));
check('release policy is fixed to the jobseeker app key',
  policy.includes("'hoiku_color_jobseeker'") && !/hoiku_poppy|poppy_staff|hoiku_office_staff/i.test(policy));
check('release policy setter defaults to maintenance hold',
  /p_maintenance_mode boolean default true/i.test(policy) &&
  policy.includes('coalesce(p_maintenance_mode,true)'));
check('release policy validates build and contract ordering',
  policy.includes('INVALID_MINIMUM_BUILD_NUMBER') &&
  policy.includes('INVALID_LATEST_BUILD_NUMBER') &&
  policy.includes('INVALID_MINIMUM_CLIENT_CONTRACT_VERSION') &&
  policy.includes('INVALID_BACKEND_CONTRACT_VERSION'));
check('release policy rejects non-HTTPS or credential-bearing store URLs',
  policy.includes("v_store_url !~* '^https://'") && policy.includes("v_host like '%@%'"));
check('release policy control uses narrow security-definer RPCs',
  (policy.match(/security definer/g) || []).length === 2 &&
  (policy.match(/set search_path = ''/g) || []).length === 2);
check('release policy RPCs are service-role only',
  (policy.match(/to service_role;/g) || []).length === 2 &&
  !/grant execute[\s\S]{0,220}to authenticated;/i.test(policy));
check('release policy table privileges are not broadened',
  !/grant\s+(select|insert|update|delete|all)[\s\S]{0,100}hc_private\.mobile_release_policy/i.test(policy));
check('release control remains a transactional migration', /^begin;/m.test(policy) && /commit;\s*$/.test(policy));

console.log(`HC Native backend rollout bundle contract passed (${checks.length}/${checks.length})`);
