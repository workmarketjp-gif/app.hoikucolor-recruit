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
check('unknown v2 RPC fails closed', sql.includes('HC_NATIVE_IDEMPOTENCY_RPC_ALREADY_EXISTS'));
check('partial schema fails closed', sql.includes('HC_NATIVE_IDEMPOTENCY_PARTIAL_SCHEMA_EXISTS'));
check('unexpected retry index fails closed', sql.includes('HC_NATIVE_IDEMPOTENCY_INDEX_ALREADY_EXISTS'));
check('message retry metadata added', /alter table public\.hc_messages[\s\S]*add column client_request_id uuid,[\s\S]*add column client_request_fingerprint text/.test(sql));
check('visit retry metadata added', /alter table public\.hc_visit_reservations[\s\S]*add column client_request_id uuid,[\s\S]*add column client_request_fingerprint text/.test(sql));
check('message retry identity unique per actor', sql.includes('hc_messages_sender_client_request_uidx'));
check('visit retry identity unique per candidate', sql.includes('hc_visit_reservations_jobseeker_client_request_uidx'));
check('message v2 delegates canonical send', /v_message\s*:=\s*public\.hc_send_message\(p_application_id,\s*v_body\)/s.test(sql));
check('message v2 does not duplicate message insert', !/insert\s+into\s+public\.hc_messages\s*\(/i.test(sql));
check('message retry conflict is verified against canonical application/body', /v_existing_application_id is distinct from p_application_id[\s\S]*v_existing\.body is distinct from v_body/.test(sql));
check('visit v2 delegates canonical visit', /v_id\s*:=\s*public\.hc_request_visit\(/s.test(sql));
check('no private visit v2 implementation duplicated', !/create or replace function hc_private\.request_visit_v2/i.test(sql));
check('actor scoped message retry lookup', /m\.sender_clerk_user_id=v_actor/.test(sql));
check('actor scoped visit retry lookup', /r\.jobseeker_clerk_user_id=v_actor/.test(sql));
check('same-key command conflicts fail closed twice', (sql.match(/IDEMPOTENCY_KEY_CONFLICT/g) || []).length >= 2);
check('message exact retry serialization', /v_actor \|\| '\|message\|' \|\| p_client_request_id::text/.test(sql));
check('visit exact retry serialization', /v_actor \|\| '\|visit\|' \|\| p_client_request_id::text/.test(sql));
check('public v2 functions revoke broad execution first', (sql.match(/from public, anon, authenticated, service_role;/g) || []).length >= 2);
check('only authenticated receives v2 execute', /grant execute on function public\.hc_send_message_v2\(uuid,text,uuid\)\s+to authenticated;/s.test(sql) && /grant execute on function public\.hc_request_visit_v2\([\s\S]*?\) to authenticated;/s.test(sql));
check('no application/interview/offer business state duplicated', !/application_status|interview_status|offer_status|hired_status/i.test(sql));
check('transactional migration', /^begin;/m.test(sql) && /commit;\s*$/.test(sql));

console.log(`HC Native mobile idempotency v5 rebase contract passed (${checks.length}/${checks.length})`);
