/**
 * Read-only source contract + deterministic ordering fixtures for the proposed
 * Hello Work 60h urgent-first re-verification picker.
 *
 * This is NOT a PostgreSQL execution test. No RPC is called because the
 * production picker stamps reverify_attempted_at on selected rows.
 * Run: node --test qa/hellowork-reverify-priority-contract.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = readFileSync(join(root, 'supabase/ops/hellowork-reverify-urgent-priority-proposal.md'), 'utf8');
const legacy = readFileSync(join(root, 'supabase/migrations/20261023001450_hc_hellowork_fair_reverify_v1.sql'), 'utf8');
const sql = spec.match(/~~~sql\n([\s\S]*?)\n~~~/)?.[1];
assert.ok(sql, 'the proposal must contain one fenced SQL candidate');

const candidatePredicates = (source) => {
  const block = source.match(/where s\.source = 'hellowork'([\s\S]*?)\n\s*\),\n\s*picked as/i)?.[1];
  assert.ok(block, 'the SQL must retain the eligible-candidate CTE');
  return block.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('and '));
};

const byId = (a, b) => a.id.localeCompare(b.id, 'en');
/** Models the SQL rank order against fixed-time fixtures only. */
function candidateOrder(rows, nowMs, urgentHours = 60) {
  const byPrefecture = new Map();
  for (const row of rows) {
    const k = row.prefecture ?? '';
    const group = byPrefecture.get(k) || [];
    group.push(row);
    byPrefecture.set(k, group);
  }
  const ranked = [];
  for (const group of byPrefecture.values()) {
    group.sort((a, b) => a.lastVerifiedMs - b.lastVerifiedMs || byId(a, b));
    group.forEach((row, index) => ranked.push({
      ...row,
      regionalRatio: (index + 1) / group.length,
      urgent: row.lastVerifiedMs < nowMs - urgentHours * 3_600_000,
    }));
  }
  return ranked.sort((a, b) =>
    Number(b.urgent) - Number(a.urgent) ||
    (a.urgent && b.urgent ? a.lastVerifiedMs - b.lastVerifiedMs : 0) ||
    a.regionalRatio - b.regionalRatio || byId(a, b)
  );
}
const now = Date.UTC(2026, 10, 12, 2, 30, 0);
const row = (id, prefecture, ageHours) => ({ id, prefecture, lastVerifiedMs: now - ageHours * 3_600_000 });

test('source contract: all previously approved publication and retry predicates survive', () => {
  const before = candidatePredicates(legacy);
  const after = candidatePredicates(sql);
  assert.deepEqual(after, before);
  assert.equal(before.length, 7);
});

test('source contract: urgent cutoff, timestamp order, proportional fallback and stable ID', () => {
  assert.match(sql, /case when c\.last_verified_at < now\(\) - interval '60 hours' then 0 else 1 end/i);
  assert.match(sql, /case when c\.last_verified_at < now\(\) - interval '60 hours'\s+then c\.last_verified_at end asc nulls last/i);
  assert.match(sql, /c\.rn::numeric\s*\/\s*c\.pref_total,\s*c\.id/i);
  assert.ok(sql.indexOf('case when c.last_verified_at') < sql.indexOf('c.rn::numeric / c.pref_total'));
});

test('source contract: RPC identity, role ACL and explicit search_path are unchanged', () => {
  for (const part of [
    'create or replace function public.hc_hellowork_pick_reverify_batch_v1(p_limit integer default 40)',
    'returns table (source_url text)',
    'language plpgsql', 'security definer', "set search_path = ''",
    'from public, anon, authenticated;', 'to service_role;',
  ]) assert.ok(sql.toLowerCase().includes(part.toLowerCase()), 'missing ' + part);
  assert.match(sql, /least\(coalesce\(p_limit, 40\), 50\)/i);
  assert.match(sql, /interval '6 hours'/);
});

test('source contract: only attempt timestamp is stamped by the picker', () => {
  assert.match(sql, /set reverify_attempted_at = now\(\)/i);
  assert.doesNotMatch(sql, /set\s+last_verified_at\s*=/i);
  assert.doesNotMatch(sql, /\b(?:delete|truncate|drop\s+table)\b/i);
});

test('urgent items are prioritized before more favorable nonurgent prefecture ratios', () => {
  const ordered = candidateOrder([
    row('small-old', 'small', 76),
    row('small-recent', 'small', 25),
    row('large-recent1', 'large', 36),
    row('large-recent2', 'large', 29),
    row('large-recent3', 'large', 27),
    row('large-recent4', 'large', 26),
  ], now);
  assert.equal(ordered[0].id, 'small-old');
});

test('urgent items use oldest verification time across prefectures', () => {
  const ordered = candidateOrder([
    row('a', 'A', 72), row('b', 'B', 80), row('c', 'C', 65), row('d', 'D', 34),
  ], now);
  assert.deepEqual(ordered.slice(0, 3).map((x) => x.id), ['b', 'a', 'c']);
});

test('under-60h items retain proportional prefecture fairness', () => {
  const ordered = candidateOrder([
    row('a', 'A', 43), row('b', 'A', 34), row('c', 'B', 55),
    row('d', 'B', 52), row('e', 'B', 49), row('f', 'B', 30),
  ], now);
  assert.deepEqual(ordered.map((x) => x.id), ['c', 'a', 'd', 'e', 'b', 'f']);
});

test('exact 60-hour boundary is not urgent (SQL uses strict less-than)', () => {
  const ordered = candidateOrder([row('exact', 'A', 60), row('beyond', 'B', 60.000001)], now);
  assert.equal(ordered[0].id, 'beyond');
  assert.equal(ordered[1].urgent, false);
});

test('duplicate time and prefecture use deterministic ID tiebreaking', () => {
  const ordered = candidateOrder([row('c', 'A', 77), row('a', 'A', 77), row('b', 'A', 77)], now);
  assert.deepEqual(ordered.map((x) => x.id), ['a', 'b', 'c']);
});

test('the proposal remains out of migrations until CLI-generated migration is available', () => {
  assert.match(spec, /NOT A MIGRATION/);
  assert.match(spec, /supabase migration new hc_hellowork_reverify_urgent_priority_v2/);
  assert.match(spec, /PostgreSQL 17/i);
  assert.match(legacy, /Production already has this migration/);
});
