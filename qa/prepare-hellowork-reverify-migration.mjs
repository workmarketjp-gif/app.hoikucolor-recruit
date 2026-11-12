#!/usr/bin/env node
/**
 * Local-only adapter for a CLI-created migration. Default is read-only.
 * No connection to Supabase, no SQL execution, no deployments.
 *
 * Usage:
 *   node qa/prepare-hellowork-reverify-migration.mjs
 *   node qa/prepare-hellowork-reverify-migration.mjs --write
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrations = join(root, 'supabase/migrations');
const original = join(migrations, '20261023001450_hc_hellowork_fair_reverify_v1.sql');
const proposal = join(root, 'supabase/ops/hellowork-reverify-urgent-priority-proposal.md');
const suffix = '_hc_hellowork_reverify_urgent_priority_v2.sql';
const requested = process.argv.slice(2);
assert.ok(requested.length <= 1 && (requested.length === 0 || requested[0] === '--write'),
  'Only --write is supported; default mode is safe and read-only');
assert.ok(existsSync(original) && existsSync(proposal),
  'Run from the app.hoikucolor-recruit source checkout with original migration and reviewed proposal');
const originalSql = readFileSync(original, 'utf8');
const spec = readFileSync(proposal, 'utf8');
const matches = [...spec.matchAll(/~~~sql\n([\s\S]*?)\n~~~/g)];
assert.equal(matches.length, 1, 'exactly one fenced proposed SQL migration must exist');
const sql = matches[0][1];
assert.match(originalSql, /Production already has this migration/,
  'the original already-applied migration must remain separately present');
assert.match(sql, /create or replace function public\.hc_hellowork_pick_reverify_batch_v1\(p_limit integer default 40\)/i);
assert.match(sql, /security definer\s+set search_path = ''/i);
assert.match(sql, /interval '60 hours'/i);
assert.match(sql, /interval '6 hours'/i);
assert.match(sql, /revoke all on function[\s\S]*?from public, anon, authenticated;/i);
assert.match(sql, /grant execute on function[\s\S]*?to service_role;/i);
assert.doesNotMatch(sql, /set\s+last_verified_at\s*=/i,
  'a selection must never fabricate official last verification time');
assert.match(sql.trim(), /^begin;/i);
assert.match(sql.trim(), /commit;$/i);
const current = new Set(readdirSync(migrations));
assert.ok(![...current].some((f) => f.endsWith(suffix)),
  'a migration with this name already exists; review that migration instead of overwriting');
if (requested.length === 0) {
  console.log('PASS: proposal and original migration verified. Dry-run only; no file created.');
  console.log('To create a new official Supabase CLI migration locally, rerun with --write.');
  process.exit(0);
}
const proc = spawnSync('supabase', ['migration', 'new', 'hc_hellowork_reverify_urgent_priority_v2'],
  { cwd: root, encoding: 'utf8', timeout: 30_000 });
if (proc.error || proc.status !== 0) {
  throw new Error('Supabase CLI migration new failed; no SQL deployed: ' +
    String(proc.error?.message || proc.stderr || 'exit=' + proc.status).slice(0, 400));
}
const created = readdirSync(migrations).filter((f) => !current.has(f) && f.endsWith(suffix) && /^\d{14}_/.test(f));
assert.equal(created.length, 1, 'Supabase CLI must create exactly one new timestamped migration');
const output = join(migrations, created[0]);
assert.equal(readFileSync(output, 'utf8').trim(), '', 'Refusing to overwrite nonempty migration');
writeFileSync(output,
  '-- CLI-generated migration: review SQL and test against disposable PG17 before ANY production apply.\n' +
  '-- DO NOT reapply 20261023001450_hc_hellowork_fair_reverify_v1.sql.\n' + sql.trim() + '\n');
console.log('CREATED NEW LOCAL MIGRATION (NOT EXECUTED): ' + output);
console.log('Next: PG17 isolated rollback test, independent review, explicit owner approval before production.');
