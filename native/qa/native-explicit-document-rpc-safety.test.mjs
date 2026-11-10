import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ExplicitDocumentSubmissionUnavailableError, isDefinitiveExplicitDocumentRpcUnavailable } from '../src/lib/explicitDocumentSubmissionSafety.ts';

test('document-selection RPC missing from PostgREST schema cache is definitely not dispatched', () => {
  const error = new ExplicitDocumentSubmissionUnavailableError({ code: 'PGRST202', message: 'function missing' });
  assert.equal(isDefinitiveExplicitDocumentRpcUnavailable(error), true);
  assert.match(error.message, /選択した書類/);
});

test('Postgres undefined-function error is definitely not dispatched', () => {
  assert.equal(isDefinitiveExplicitDocumentRpcUnavailable(new ExplicitDocumentSubmissionUnavailableError({ code: '42883' })), true);
});

test('message-only missing RPC cannot prove that a mutation never reached the server', () => {
  assert.equal(isDefinitiveExplicitDocumentRpcUnavailable(new ExplicitDocumentSubmissionUnavailableError({ message: 'Could not find the function' })), false);
});

test('ambiguous transport and unrelated errors never authorize clearing a pending receipt', () => {
  assert.equal(isDefinitiveExplicitDocumentRpcUnavailable(new ExplicitDocumentSubmissionUnavailableError({ code: '503', message: 'temporarily unavailable' })), false);
  assert.equal(isDefinitiveExplicitDocumentRpcUnavailable(new Error('offline')), false);
  assert.equal(isDefinitiveExplicitDocumentRpcUnavailable(null), false);
});

test('actual submission adapter refuses v1 downgrade for explicit document choice', () => {
  const source = readFileSync(new URL('../src/lib/applicationJourneyApi.ts', import.meta.url), 'utf8');
  const start = source.indexOf('if (error && selectedIds && isMissingRpcError(error))');
  assert.ok(start > 0, 'explicit-choice missing-RPC branch must exist');
  const end = source.indexOf('if (error) throw submissionDocumentError(error)', start);
  assert.ok(end > start, 'submission error must still be handled');
  const branch = source.slice(start, end);
  assert.match(branch, /throw new ExplicitDocumentSubmissionUnavailableError\(error\)/);
  assert.doesNotMatch(branch, /client\.rpc\('hc_jobseeker_submit_application'/, 'legacy RPC must not be called after explicit choice failed');
});

test('actual job detail clears a receipt only for definitely uninvoked RPC', () => {
  const source = readFileSync(new URL('../src/app/job/[id].tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(submitDispatched && isDefinitiveExplicitDocumentRpcUnavailable\(applyError\)\)/);
  const guard = source.indexOf('if (submitDispatched && isDefinitiveExplicitDocumentRpcUnavailable(applyError))');
  const quarantine = source.indexOf('if (submitDispatched)', guard + 12);
  assert.ok(guard > 0 && quarantine > guard);
  const guarded = source.slice(guard, quarantine);
  assert.match(guarded, /await clearPendingHomeApplication\(ownerId, jobId\)/);
  assert.match(guarded, /catch \{/);
  assert.match(guarded, /setApplicationUncertain\(false\)/);
  assert.match(source.slice(quarantine, quarantine + 750), /reconcileAmbiguousApplication/);
});
