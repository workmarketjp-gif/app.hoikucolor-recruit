import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationPath = path.join(root, 'supabase/migrations/20260919114500_hc_native_account_deletion_push_quarantine_v1.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');
const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);

check('requires deletion freeze and push pipeline baseline',
  sql.includes('HC_NATIVE_ACCOUNT_DELETION_PUSH_BASELINE_MISSING') &&
  sql.includes("to_regprocedure('hc_private.jobseeker_account_is_frozen_v1(text)')") &&
  sql.includes("to_regprocedure('public.hc_mobile_claim_push_batch_v1(text,integer)')"));
check('fails closed if canonical push stops depending on active installation',
  sql.includes('HC_NATIVE_PUSH_ACTIVE_INSTALLATION_CONTRACT_DRIFT') &&
  (sql.match(/i\.revoked_at is null/g) || []).length >= 4 &&
  (sql.match(/i\.notifications_authorized/g) || []).length >= 4 &&
  (sql.match(/i\.push_token is not null/g) || []).length >= 4);
check('deletion request keeps canonical per-principal advisory lock',
  sql.includes("pg_advisory_xact_lock(hashtextextended('hc-account-delete|'||a,0))"));
check('deletion request revokes only HC jobseeker installations',
  /update hc_private\.mobile_installations i[\s\S]*i\.app_key='hoiku_color_jobseeker'[\s\S]*i\.recipient_clerk_user_id=a/.test(sql));
check('deletion request clears provider token and authorization',
  /set push_token=null,[\s\S]*notifications_authorized=false,[\s\S]*revoked_at=coalesce\(i\.revoked_at,now\(\)\)/.test(sql));
check('deletion request suppresses queued failed and processing pushes',
  /d\.status in \('queued','failed','processing'\)/.test(sql) && sql.includes("last_error_code='ACCOUNT_DELETION_REQUESTED'"));
check('processing claim ownership is cleared on deletion request',
  sql.includes('locked_at=null') && sql.includes('claimed_by=null'));
check('pending receipt polling is stopped on deletion request',
  /d\.status='sent'[\s\S]*d\.receipt_state in \('pending','checking'\)/.test(sql) &&
  sql.includes("receipt_error_code='ACCOUNT_DELETION_REQUESTED'") &&
  sql.includes('receipt_available_at=null') && sql.includes('receipt_claimed_by=null'));
check('migration relies on existing enqueue reconcile claim validate rather than copying business routing',
  !/create or replace function hc_private\.enqueue_jobseeker_mobile_push_v1\(\)/.test(sql) &&
  !/create or replace function public\.hc_mobile_claim_push_batch_v1\(/.test(sql) &&
  !/create or replace function public\.hc_mobile_validate_push_claim_v1\(/.test(sql));
check('existing active deletion installations are quarantined on migration apply',
  /update hc_private\.mobile_installations i[\s\S]*jobseeker_account_is_frozen_v1\(i\.recipient_clerk_user_id\);[\s\S]*update hc_private\.mobile_push_deliveries d/.test(sql));
check('apply-time quarantine stops receipts already pending for frozen candidates',
  /update hc_private\.mobile_push_deliveries d[\s\S]*d\.status='sent'[\s\S]*d\.receipt_state in \('pending','checking'\)[\s\S]*jobseeker_account_is_frozen_v1\(i\.recipient_clerk_user_id\)/.test(sql));
check('Poppy and staff app keys are not introduced',
  !/hoiku_poppy|poppy_staff|hoiku_office_staff/.test(sql));
check('canonical notifications are not deleted or rewritten',
  !/delete\s+from\s+public\.hc_notifications/i.test(sql) && !/update\s+public\.hc_notifications/i.test(sql));
check('push content and candidate PII are not copied into delivery queue',
  !/insert into hc_private\.mobile_push_deliveries\s*\([^)]*(title|body|email|phone|applicant_name)/is.test(sql));
check('cancel is intentionally not overridden to silently reactivate push',
  !/create or replace function public\.hc_jobseeker_cancel_account_deletion_v1\(\)/.test(sql));

const failed = checks.filter(([, ok]) => !ok);
console.log(JSON.stringify({ total: checks.length, passed: checks.length - failed.length, failed: failed.map(([name]) => name) }, null, 2));
if (failed.length) process.exit(1);
