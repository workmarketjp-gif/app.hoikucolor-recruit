import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSearchObservation, mergeSourcePayloadProvenance } from '../supabase/functions/hc-hellowork-import/discovery-provenance.mjs';

const importer = fs.readFileSync('supabase/functions/hc-hellowork-import/index.ts', 'utf8');
const t1 = createSearchObservation(1, '保育士', 2, '2026-10-27T12:30:00Z');
const t2 = createSearchObservation(47, '保育教諭', 1, '2026-10-27T12:40:00Z');
assert.equal(t1.prefecture_code, '01');
assert.equal(t2.prefecture_code, '47');
for (const [pref, term, page] of [[0, '保育士', 1], [48, '保育士', 1],
  [3, '会社員', 1], [3, '保育士', 0], [3, '保育士', -5]]) {
  assert.throws(() => createSearchObservation(pref, term, page, '2026-10-27T12:00:00Z'));
}
assert.throws(() => createSearchObservation(1, '保育士', 1, 'bad timestamp'));

const first = mergeSourcePayloadProvenance({ parser_version: 'x' }, null, t1);
assert.deepEqual(first.discovery_search.observed_prefecture_codes, ['01']);
assert.deepEqual(first.discovery_search.observed_search_terms, ['保育士']);
assert.equal(first.discovery_search.evidence_kind, 'search_filter_only');
assert.equal(first.prefecture, undefined, 'never write actual workplace prefecture');

const second = mergeSourcePayloadProvenance({ parser_version: 'y' }, first, t2);
assert.deepEqual(second.discovery_search.observed_prefecture_codes, ['01', '47']);
assert.deepEqual(second.discovery_search.observed_search_terms, ['保育士', '保育教諭'].sort());
assert.equal(second.discovery_search.first_observed_at, t1.observed_at);
assert.equal(second.discovery_search.last_observed_at, t2.observed_at);
assert.equal(second.discovery_search.last_search.prefecture_code, '47');

const verifiedAgain = mergeSourcePayloadProvenance({ parser_version: 'z' }, second);
assert.deepEqual(verifiedAgain.discovery_search, second.discovery_search,
  're-verification must preserve search evidence');
assert.deepEqual(mergeSourcePayloadProvenance({ parser_version: 'x' }, null), { parser_version: 'x' },
  'manual import with no prior search evidence must not invent one');

const repeated = mergeSourcePayloadProvenance({ parser_version: 'zz' }, second, t2);
assert.equal(repeated.discovery_search.observed_prefecture_codes.length, 2,
  'repeated observations must not grow arrays');

assert.match(importer, /import \{ createSearchObservation, mergeSourcePayloadProvenance \}/);
assert.match(importer, /select\('source_job_id,source_payload'\)/,
  'read prior private search provenance in one bounded batch');
assert.match(importer, /mergeSourcePayloadProvenance\(row\.source_payload, existingPayload, observation\)/);
assert.match(importer, /createSearchObservation\(prefecture, queryTerm, page,/);
assert.match(importer, /importUrls\(toFetch, observation\)/);
assert.match(importer, /const \{ prefecture, city, address \} = locationParts\(location\)/,
  'workplace must still be determined only from the official job detail');
assert.doesNotMatch(importer, /prefecture:\s*observation\.prefecture_code/,
  'never promote discovery search prefecture to verified workplace');
console.log('Hello Work search provenance: 15 assertions / cases PASS (source contract).');
