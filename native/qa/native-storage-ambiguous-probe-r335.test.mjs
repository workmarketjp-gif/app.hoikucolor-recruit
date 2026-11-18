import assert from 'node:assert/strict';
import test from 'node:test';
import { requireStorageSignedUrlPresence } from '../src/lib/storageSignedUrlPresence.ts';
import { ensureLeaseFencedStorageUpload } from '../src/lib/leaseFencedStorageUpload.ts';

const rejected = (message) => ({ data: null, error: { status: 404, message } });

test('a positively signed private object returns true', () => {
  assert.equal(requireStorageSignedUrlPresence({ data: { signedUrl: 'https://example.invalid/signed' }, error: null }), true);
});

test('404/not_found cannot authorize a duplicate write', async () => {
  let writes = 0;
  await assert.rejects(ensureLeaseFencedStorageUpload({
    assertCurrent: () => {},
    upload: async () => { writes++; return { error: new Error('lost acknowledgement') }; },
    exists: async () => requireStorageSignedUrlPresence(rejected('not_found')),
  }), /保存状況を確認できません/);
  assert.equal(writes, 1);
});

test('403 unauthorized cannot become a false negative', () => {
  assert.throws(() => requireStorageSignedUrlPresence({ data: null, error: { status: 403 } }), /保存状況を確認できません/);
});

test('429 rate limit and 5xx cannot become a false negative', () => {
  for (const status of [429, 500, 544]) {
    assert.throws(() => requireStorageSignedUrlPresence({ data: null, error: { status } }), /保存状況を確認できません/);
  }
});

test('missing signedUrl on 2xx is not proof of absence', () => {
  assert.throws(() => requireStorageSignedUrlPresence({ data: {}, error: null }), /保存状況を確認できません/);
  assert.throws(() => requireStorageSignedUrlPresence({ data: { signedUrl: '   ' }, error: null }), /保存状況を確認できません/);
});

test('a thrown Storage probe is quarantined without raw private path leakage', async () => {
  let writes = 0;
  await assert.rejects(ensureLeaseFencedStorageUpload({
    assertCurrent: () => {},
    upload: async () => { writes++; return { error: new Error('private/path/file.pdf') }; },
    exists: async () => { throw new Error('private/path/file.pdf'); },
  }), (error) => {
    assert.match(error.message, /保存状況を確認できません/);
    assert.doesNotMatch(error.message, /private\/path/);
    return true;
  });
  assert.equal(writes, 1);
});

test('first write success never probes or retries', async () => {
  let writes = 0, probes = 0;
  await ensureLeaseFencedStorageUpload({
    assertCurrent: () => {},
    upload: async () => { writes++; return { error: null }; },
    exists: async () => { probes++; throw new Error('unexpected'); },
  });
  assert.equal(writes, 1); assert.equal(probes, 0);
});

test('ambiguous write reconciles via positive server read without repeat', async () => {
  let writes = 0;
  await ensureLeaseFencedStorageUpload({
    assertCurrent: () => {},
    upload: async () => { writes++; return { error: new Error('timeout') }; },
    exists: async () => requireStorageSignedUrlPresence({ data: { signedUrl: 'https://example.invalid/ok' }, error: null }),
  });
  assert.equal(writes, 1);
});
