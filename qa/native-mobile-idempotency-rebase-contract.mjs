import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationPath = 'supabase/migrations/20260919063000_hc_native_mobile_idempotency_v5.sql';
const sql = fs.readFileSync(path.join(root, migrationPath), 'utf8');
const checks = [];
const check = (name, ok) => {
  checks.push([name, Boolean(ok)]);
  if (!ok) throw new Error(`FAIL: ${name}`);
};

check('current Production baseline named in source', sql.includes('20260919060410_hc_admin_offer_response_state_safe_read_v2'));
check('canonical send preflight', sql.includes("to_regprocedure('public.hc_send_message(uuid,text)')"));
check('canonical visit preflight', sql.includes("to_regprocedure('public.hc_request_visit(uuid,text,date,time without time zone,uuid,text)')"));
check('unknown v2/receipt RPC fails closed', sql.includes('HC_NATIVE_IDEMPOTENCY_RPC_ALREADY_EXISTS'));
check('unknown receipt table fails closed', sql.includes('HC_NATIVE_IDEMPOTENCY_RECEIPT_TABLE_ALREADY_EXISTS'));
check('partial base-table candidate fails closed', sql.includes('HC_NATIVE_IDEMPOTENCY_PARTIAL_SCHEMA_EXISTS'));
check('private receipt table isolates Native retry metadata', /create table hc_private\.mobile_mutation_receipts/.test(sql));
check('receipt table locked from browser/service roles', /revoke all on table hc_private\.mobile_mutation_receipts\s+from public, anon, authenticated, service_role;/s.test(sql));
check('no retry columns added to hc_messages', !/alter table public\.hc_messages/i.test(sql));
check('no retry columns added to hc_visit_reservations', !/alter table public\.hc_visit_reservations/i.test(sql));
check('message v2 uses narrow security-definer boundary', /create or replace function public\.hc_send_message_v2[\s\S]*?security definer[\s\S]*?set search_path = ''/.test(sql));
check('visit v2 uses narrow security-definer boundary', /create or replace function public\.hc_request_visit_v2[\s\S]*?security definer[\s\S]*?set search_path = ''/.test(sql));
check('wrappers authenticate from jwt sub', (sql.match(/nullif\(\(select auth\.jwt\(\)\) ->> 'sub', ''\)/g) || []).length >= 3);
check('message v2 delegates canonical send', /v_message\s*:=\s*public\.hc_send_message\(p_application_id,\s*v_body\)/s.test(sql));
check('message v2 does not duplicate message insert', !/insert\s+into\s+public\.hc_messages\s*\(/i.test(sql));
check('message receipt is actor scoped', /recipient_clerk_user_id=v_actor[\s\S]*mutation_kind='message'[\s\S]*client_request_id=p_client_request_id/.test(sql));
check('message replay verifies payload/application', /v_receipt\.payload_fingerprint is distinct from v_fingerprint[\s\S]*v_receipt\.application_id is distinct from p_application_id/.test(sql));
check('message canonical result is actor verified', /v_message\.sender_clerk_user_id is distinct from v_actor/.test(sql));
check('visit v2 delegates canonical visit', /v_id\s*:=\s*public\.hc_request_visit\(/s.test(sql));
check('no private visit business implementation duplicated', !/create or replace function hc_private\.request_visit_v2/i.test(sql));
check('visit receipt is actor scoped', /recipient_clerk_user_id=v_actor[\s\S]*mutation_kind='visit'[\s\S]*client_request_id=p_client_request_id/.test(sql));
check('visit replay verifies payload/application/job', /v_receipt\.payload_fingerprint is distinct from v_fingerprint[\s\S]*v_receipt\.application_id is distinct from p_application_id[\s\S]*v_receipt\.job_id is distinct from p_job_id/.test(sql));
check('visit canonical result is actor verified', /r\.id=v_id[\s\S]*r\.jobseeker_clerk_user_id=v_actor/.test(sql));
check('same-key conflicts fail closed', (sql.match(/IDEMPOTENCY_KEY_CONFLICT/g) || []).length >= 2);
check('message exact retry serialization', /v_actor \|\| '\|message\|' \|\| p_client_request_id::text/.test(sql));
check('visit exact retry serialization', /v_actor \|\| '\|visit\|' \|\| p_client_request_id::text/.test(sql));
check('receipt RPC exists for process-death reconciliation', /public\.hc_jobseeker_get_mutation_receipt_v1\(/.test(sql));
check('receipt RPC returns Native camelCase contract', /'resourceId'[\s\S]*'applicationId'[\s\S]*'jobId'[\s\S]*'createdAt'/.test(sql));
check('receipt lookup is candidate scoped', /r\.recipient_clerk_user_id=v_actor[\s\S]*r\.mutation_kind=p_kind[\s\S]*r\.client_request_id=p_client_request_id/.test(sql));
check('broad function execution revoked', (sql.match(/from public, anon, authenticated, service_role;/g) || []).length >= 3);
check('only authenticated receives v2/receipt execute', (sql.match(/to authenticated;/g) || []).length >= 3);
check('no application/interview/offer business state duplicated', !/application_status|interview_status|offer_status|hired_status/i.test(sql));
check('transactional migration', /^begin;/m.test(sql) && /commit;\s*$/.test(sql));

console.log(`HC Native mobile idempotency v5 rebase contract passed (${checks.length}/${checks.length})`);
