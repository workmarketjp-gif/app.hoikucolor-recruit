#!/usr/bin/env node
/**
 * PG17 disposable-database verification for the Hello Work reverify picker.
 * This script NEVER deploys. It only connects to a local database named
 * hc_reverify_qa and executes all fixtures/function changes inside a transaction
 * that is explicitly rolled back. Read-only --inspect is the default.
 *
 * node qa/hellowork-reverify-pg17-rollback.mjs
 * node qa/hellowork-reverify-pg17-rollback.mjs --run
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spec = readFileSync(resolve(root, 'supabase/ops/hellowork-reverify-urgent-priority-proposal.md'), 'utf8');
const blocks = [...spec.matchAll(/~~~sql\n([\s\S]*?)\n~~~/g)];
assert.equal(blocks.length, 1, 'Expected one SQL candidate in proposal');
const candidate = blocks[0][1];
assert.match(candidate, /^\s*begin;\s*/i);
assert.match(candidate, /\scommit;\s*$/i);
const inner = candidate.replace(/^\s*begin;\s*/i, '').replace(/\scommit;\s*$/i, '').trim();
// The v2 proposal explicitly requires the already-deployed v1 RPC. Recreate
// the exact applied v1 migration inside this disposable transaction first;
// otherwise the v2 prerequisite guard fails before any behavioral assertions.
const legacySql = readFileSync(resolve(root, 'supabase/migrations/20261023001450_hc_hellowork_fair_reverify_v1.sql'), 'utf8');
assert.match(legacySql, /Production already has this migration/);
const legacyBlock = legacySql.match(/(?:^|\n)begin;\s*\n([\s\S]*?)\ncommit;\s*$/i);
assert.ok(legacyBlock, 'Applied v1 fixture must have one outer BEGIN/COMMIT');
const legacyInner = legacyBlock[1].trim();
assert.match(legacyInner, /create or replace function public\.hc_hellowork_pick_reverify_batch_v1\(/i);
assert.match(legacyInner, /revoke all on function[\s\S]*?from public, anon, authenticated;/i);
assert.match(inner, /create or replace function public\.hc_hellowork_pick_reverify_batch_v1\(/);
assert.match(inner, /security definer\s+set search_path = ''/i);
assert.match(inner, /interval '60 hours'/i);
assert.match(inner, /interval '6 hours'/i);
assert.match(inner, /revoke all on function[\s\S]*?from public, anon, authenticated;/i);
assert.match(inner, /grant execute on function[\s\S]*?to service_role;/i);
assert.doesNotMatch(inner, /\b(set\s+last_verified_at|drop\s+table|truncate|delete\s+from)\b/i);
const opts = process.argv.slice(2);
assert.ok(opts.length === 0 || (opts.length === 1 && opts[0] === '--run'), 'Only --run is supported');
if (opts.length === 0) {
  console.log('INSPECT PASS: proposal SQL checked; no database connection or changes.');
  console.log('For a disposable *local* PostgreSQL 17 database named hc_reverify_qa, use --run.');
  process.exit(0);
}
// Prevent accidental remote/staging/Production connections even if local env has
// a service/URI configured. Explicit local database name is non-negotiable.
for (const k of ['PGSERVICE', 'PGSERVICEFILE', 'PGHOSTADDR', 'DATABASE_URL', 'SUPABASE_DB_URL']) {
  assert.ok(!process.env[k], `Refuse inherited ${k} for disposable database test`);
}
const host = process.env.PGHOST || '';
assert.ok(host === '' || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.startsWith('/'),
  'Refuse any remote PostgreSQL host');
assert.ok(!process.env.PGDATABASE || process.env.PGDATABASE === 'hc_reverify_qa',
  'PGDATABASE must be hc_reverify_qa');

// Execute only the exact SQL in the NEW, CLI-generated migration; testing the
// proposal alone could accidentally certify a different migration payload.
const migrationDir = resolve(root, 'supabase/migrations');
const newMigration = readdirSync(migrationDir).filter((name) =>
  /^\d{14}_hc_hellowork_reverify_urgent_priority_v2\.sql$/.test(name));
assert.equal(newMigration.length, 1,
  'Generate exactly one new migration with the official Supabase CLI before --run');
const generated = readFileSync(resolve(migrationDir, newMigration[0]), 'utf8');
// Exact equality rejects additional SQL before or after the approved function.
// The generator adds precisely these two informational comments.
const expectedMigration =
  '-- CLI-generated migration: review SQL and test against disposable PG17 before ANY production apply.\n' +
  '-- DO NOT reapply 20261023001450_hc_hellowork_fair_reverify_v1.sql.\n' +
  candidate.trim() + '\n';
assert.equal(generated, expectedMigration,
  'The CLI-generated migration must match the reviewed SQL exactly, without other statements');

const sql = String.raw`
\set ON_ERROR_STOP on
BEGIN;
DO $preflight$
BEGIN
  IF current_database() <> 'hc_reverify_qa' THEN
    RAISE EXCEPTION 'Refusing non-test database %', current_database();
  END IF;
  IF current_setting('server_version_num')::int / 10000 <> 17 THEN
    RAISE EXCEPTION 'PostgreSQL 17 required';
  END IF;
END
$preflight$;
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$roles$;
CREATE TABLE public.hc_external_source_sync_control (
  source text PRIMARY KEY, enabled boolean NOT NULL, publication_enabled boolean NOT NULL
);
CREATE TABLE public.hc_external_job_sources (
  id uuid PRIMARY KEY, source text NOT NULL, source_url text NOT NULL,
  prefecture text, last_verified_at timestamptz NOT NULL,
  reverify_attempted_at timestamptz,
  source_status text NOT NULL, public_republication_allowed boolean NOT NULL,
  claimed_job_id uuid, closing_at timestamptz, expires_at timestamptz
);
INSERT INTO public.hc_external_source_sync_control VALUES ('hellowork', true, true);
-- Two overdue genuine postings in small prefectures; several newer eligible
-- postings; and three excluded postings. All records are synthetic.
INSERT INTO public.hc_external_job_sources
  (id,source,source_url,prefecture,last_verified_at,reverify_attempted_at,
   source_status,public_republication_allowed,closing_at)
VALUES
 ('00000000-0000-4000-8000-000000000001','hellowork','https://example.test/old-a','A',now()-interval '85 hours',null,'active',true,null),
 ('00000000-0000-4000-8000-000000000002','hellowork','https://example.test/old-b','B',now()-interval '72 hours',null,'active',true,null),
 ('00000000-0000-4000-8000-000000000003','hellowork','https://example.test/new-c','C',now()-interval '45 hours',null,'active',true,null),
 ('00000000-0000-4000-8000-000000000004','hellowork','https://example.test/new-d','C',now()-interval '38 hours',null,'active',true,null),
 ('00000000-0000-4000-8000-000000000005','hellowork','https://example.test/new-e','D',now()-interval '26 hours',null,'active',true,null),
 ('00000000-0000-4000-8000-000000000006','hellowork','https://example.test/blocked','E',now()-interval '98 hours',null,'blocked',false,null),
 ('00000000-0000-4000-8000-000000000007','hellowork','https://example.test/cooldown','F',now()-interval '92 hours',now()-interval '1 hour','active',true,null),
 ('00000000-0000-4000-8000-000000000008','hellowork','https://example.test/closed','G',now()-interval '90 hours',null,'active',true,now()-interval '1 hour'),
 ('00000000-0000-4000-8000-000000000009','hellowork','https://example.test/too-fresh','H',now()-interval '10 hours',null,'active',true,null);
` + legacyInner + String.raw`
-- Confirm this is a genuine upgrade scenario, not a clean-install test.
DO $assert_legacy$
BEGIN
 IF to_regprocedure('public.hc_hellowork_pick_reverify_batch_v1(integer)') IS NULL
 THEN RAISE EXCEPTION 'Legacy v1 RPC fixture must exist before v2 replacement'; END IF;
END
$assert_legacy$;
` + inner + String.raw`
// Security and interface contracts: browser roles cannot execute.
DO $assert_acl$
BEGIN
 IF has_function_privilege('anon','public.hc_hellowork_pick_reverify_batch_v1(integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.hc_hellowork_pick_reverify_batch_v1(integer)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.hc_hellowork_pick_reverify_batch_v1(integer)','EXECUTE')
 THEN RAISE EXCEPTION 'RPC role permissions changed'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_proc
   WHERE oid='public.hc_hellowork_pick_reverify_batch_v1(integer)'::regprocedure
     AND prosecdef AND proconfig @> ARRAY['search_path=""']::text[]
 ) THEN RAISE EXCEPTION 'SECURITY DEFINER / empty search_path contract changed'; END IF;
END
$assert_acl$;
CREATE TEMP TABLE hc_picked_1 (source_url text);
INSERT INTO hc_picked_1 SELECT source_url FROM public.hc_hellowork_pick_reverify_batch_v1(2);
DO $assert_first_batch$
BEGIN
 IF (SELECT count(*) FROM hc_picked_1) <> 2
    OR NOT EXISTS (SELECT 1 FROM hc_picked_1 WHERE source_url='https://example.test/old-a')
    OR NOT EXISTS (SELECT 1 FROM hc_picked_1 WHERE source_url='https://example.test/old-b')
 THEN RAISE EXCEPTION 'Urgent first batch must contain exactly both oldest jobs'; END IF;
 IF (SELECT count(*) FROM public.hc_external_job_sources
     WHERE reverify_attempted_at IS NOT NULL) <> 3
 THEN RAISE EXCEPTION 'Picker unexpectedly stamped extra jobs'; END IF;
 IF (SELECT count(*) FROM public.hc_external_job_sources
     WHERE last_verified_at < now()-interval '60 hours'
       AND source_status='active' AND public_republication_allowed
       AND reverify_attempted_at >= now()-interval '5 minutes') <> 2
 THEN RAISE EXCEPTION 'Two overdue jobs must be stamped as attempted'; END IF;
 IF (SELECT count(*) FROM public.hc_external_job_sources
     WHERE last_verified_at >= now()-interval '24 hours') <> 1
 THEN RAISE EXCEPTION 'Do not change last_verified_at during picking'; END IF;
END
$assert_first_batch$;
CREATE TEMP TABLE hc_picked_2 (source_url text);
INSERT INTO hc_picked_2 SELECT source_url FROM public.hc_hellowork_pick_reverify_batch_v1(2);
DO $assert_second_batch$
BEGIN
 IF (SELECT count(*) FROM hc_picked_2) <> 2
    OR EXISTS (SELECT 1 FROM hc_picked_2 WHERE source_url LIKE '%old-%')
    OR EXISTS (SELECT 1 FROM hc_picked_2 WHERE source_url LIKE '%blocked%'
                            OR source_url LIKE '%cooldown%' OR source_url LIKE '%closed%')
 THEN RAISE EXCEPTION 'Cooldown/blocked/closed URL leaked or duplicate re-picked'; END IF;
END
$assert_second_batch$;
UPDATE public.hc_external_source_sync_control SET publication_enabled=false WHERE source='hellowork';
CREATE TEMP TABLE hc_disabled (source_url text);
INSERT INTO hc_disabled SELECT source_url FROM public.hc_hellowork_pick_reverify_batch_v1(40);
DO $assert_disabled$
BEGIN
 IF EXISTS (SELECT 1 FROM hc_disabled)
 THEN RAISE EXCEPTION 'Disabled publication must yield no picker results'; END IF;
END
$assert_disabled$;
SELECT 'PG17_ROLLBACK_TEST_PASS' AS result;
ROLLBACK;
`;

const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-d', 'hc_reverify_qa'], {
  cwd: root, env: process.env, encoding: 'utf8', timeout: 60_000,
  input: sql, maxBuffer: 8 * 1024 * 1024,
});
if (result.error || result.status !== 0) {
  throw new Error('PG17 isolated transactional verification FAILED/UNAVAILABLE: ' +
    String(result.error?.message || result.stderr || 'exit=' + result.status).slice(0,1200));
}
assert.match(result.stdout, /PG17_ROLLBACK_TEST_PASS/, 'test SQL did not complete');
console.log('PG17 isolated transaction PASS; the SQL transaction ended with ROLLBACK.');