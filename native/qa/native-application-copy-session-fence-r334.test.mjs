import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureLeaseFencedStorageUpload } from '../src/lib/leaseFencedStorageUpload.ts';

// Application copies use the real reusable Storage lease helper. These tests
// exercise the copy callback with controlled synthetic data, not a mocked SDK.
const runCopy = ({ copy, exists, assertCurrent }) => ensureLeaseFencedStorageUpload({
  upload: copy,
  exists,
  assertCurrent,
});
const revoked = () => { throw new Error('SESSION_REVOKED'); };

test('successful application copy never probes or repeats a Storage write', async () => {
  let copies = 0; let checks = 0;
  await runCopy({
    copy: async () => { copies++; return { error: null }; },
    exists: async () => { checks++; return false; },
    assertCurrent: () => {},
  });
  assert.equal(copies, 1); assert.equal(checks, 0);
});

test('lost response after destination copy is reconciled without a second copy', async () => {
  let copies = 0; let checks = 0;
  await runCopy({
    copy: async () => { copies++; return { error: new Error('timeout') }; },
    exists: async () => { checks++; return true; },
    assertCurrent: () => {},
  });
  assert.equal(copies, 1); assert.equal(checks, 1);
});

test('unconfirmed destination absence is quarantined without a second copy', async () => {
  let copies = 0; let checks = 0;
  await assert.rejects(runCopy({
    copy: async () => { copies++; return { error: new Error('copy reply lost') }; },
    exists: async () => { checks++; return false; },
    assertCurrent: () => {},
  }), /保存状況を確認できません/);
  assert.equal(copies, 1); assert.equal(checks, 1);
});

test('A→B switch before source copy starts stops all private Storage calls', async () => {
  let copies = 0;
  await assert.rejects(runCopy({
    copy: async () => { copies++; return { error: null }; },
    exists: async () => false,
    assertCurrent: revoked,
  }), /SESSION_REVOKED/);
  assert.equal(copies, 0);
});

test('session revocation during ambiguous first copy stops existence and retry', async () => {
  let active = true; let copies = 0; let checks = 0;
  await assert.rejects(runCopy({
    copy: async () => { copies++; active = false; return { error: new Error('copy reply lost') }; },
    exists: async () => { checks++; return false; },
    assertCurrent: () => { if (!active) revoked(); },
  }), /SESSION_REVOKED/);
  assert.equal(copies, 1); assert.equal(checks, 0);
});

test('session revocation during slow destination-existence probe prevents second copy', async () => {
  let active = true; let copies = 0; let checks = 0;
  await assert.rejects(runCopy({
    copy: async () => { copies++; return { error: new Error('copy unavailable') }; },
    exists: async () => { checks++; active = false; return false; },
    assertCurrent: () => { if (!active) revoked(); },
  }), /SESSION_REVOKED/);
  assert.equal(copies, 1); assert.equal(checks, 1);
});

test('session revocation during positive existence probe never reports success', async () => {
  let active = true; let copies = 0;
  await assert.rejects(runCopy({
    copy: async () => { copies++; return { error: new Error('transient') }; },
    exists: async () => { active = false; return true; },
    assertCurrent: () => { if (!active) revoked(); },
  }), /SESSION_REVOKED/);
  assert.equal(copies, 1);
});

test('an unresolved failed copy does not retry even if the probe returns false', async () => {
  let copies = 0; let checks = 0;
  await assert.rejects(runCopy({
    copy: async () => { copies++; return { error: new Error('copy failed') }; },
    exists: async () => { checks++; return false; },
    assertCurrent: () => {},
  }), /保存状況を確認できません/);
  assert.equal(copies, 1); assert.equal(checks, 1);
});

test('destination-existence transport exception never starts an uncertain second copy', async () => {
  let copies = 0;
  await assert.rejects(runCopy({
    copy: async () => { copies++; return { error: new Error('copy timeout') }; },
    exists: async () => { throw new Error('storage unavailable'); },
    assertCurrent: () => {},
  }), /保存状況を確認できません/);
  assert.equal(copies, 1);
});
