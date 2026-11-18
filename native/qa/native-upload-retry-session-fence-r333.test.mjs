import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureLeaseFencedStorageUpload } from '../src/lib/leaseFencedStorageUpload.ts';

const revoked = () => { throw new Error('DOCUMENT_UPLOAD_QUARANTINED'); };

test('successful upload does not perform existence probes or retry', async () => {
  let writes = 0; let reads = 0;
  await ensureLeaseFencedStorageUpload({
    assertCurrent: () => {},
    upload: async () => { writes++; return { error: null }; },
    exists: async () => { reads++; return false; },
  });
  assert.equal(writes, 1); assert.equal(reads, 0);
});

test('error after object creation is resolved by one current-owner read, not a duplicate upload', async () => {
  let writes = 0;
  await ensureLeaseFencedStorageUpload({
    assertCurrent: () => {},
    upload: async () => { writes++; return { error: new Error('lost reply') }; },
    exists: async () => true,
  });
  assert.equal(writes, 1);
});

test('failed first upload can retry once while lease is valid', async () => {
  let writes = 0;
  await ensureLeaseFencedStorageUpload({
    assertCurrent: () => {},
    upload: async () => ({ error: ++writes === 1 ? new Error('first failed') : null }),
    exists: async () => false,
  });
  assert.equal(writes, 2);
});

test('revocation during first upload blocks existence check and second upload', async () => {
  let current = true; let writes = 0; let reads = 0;
  await assert.rejects(() => ensureLeaseFencedStorageUpload({
    assertCurrent: () => { if (!current) revoked(); },
    upload: async () => { writes++; current = false; return { error: new Error('lost response') }; },
    exists: async () => { reads++; return false; },
  }), /DOCUMENT_UPLOAD_QUARANTINED/);
  assert.equal(writes, 1); assert.equal(reads, 0);
});

test('revocation during object-existence check blocks second upload', async () => {
  let current = true; let writes = 0;
  await assert.rejects(() => ensureLeaseFencedStorageUpload({
    assertCurrent: () => { if (!current) revoked(); },
    upload: async () => { writes++; return { error: new Error('temporarily unavailable') }; },
    exists: async () => { current = false; return false; },
  }), /DOCUMENT_UPLOAD_QUARANTINED/);
  assert.equal(writes, 1);
});

test('revocation before the first request prevents all storage calls', async () => {
  let writes = 0;
  await assert.rejects(() => ensureLeaseFencedStorageUpload({
    assertCurrent: revoked,
    upload: async () => { writes++; return { error: null }; },
    exists: async () => true,
  }), /DOCUMENT_UPLOAD_QUARANTINED/);
  assert.equal(writes, 0);
});

test('two write errors and no confirmed object propagates the error without further retries', async () => {
  let writes = 0; let reads = 0;
  await assert.rejects(() => ensureLeaseFencedStorageUpload({
    assertCurrent: () => {},
    upload: async () => { writes++; return { error: new Error(`failure ${writes}`) }; },
    exists: async () => { reads++; return false; },
  }), /failure 2/);
  assert.equal(writes, 2); assert.equal(reads, 2);
});

test('revocation after second storage response does not report success', async () => {
  let current = true; let writes = 0;
  await assert.rejects(() => ensureLeaseFencedStorageUpload({
    assertCurrent: () => { if (!current) revoked(); },
    upload: async () => { writes++; if (writes === 2) current = false; return { error: writes === 1 ? new Error('first') : null }; },
    exists: async () => false,
  }), /DOCUMENT_UPLOAD_QUARANTINED/);
  assert.equal(writes, 2);
});
