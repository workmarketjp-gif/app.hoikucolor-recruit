import test from 'node:test';
import assert from 'node:assert/strict';
import { isResumePdfPhotoSnapshotCurrent } from '../src/lib/resumePdfPhotoSnapshot.ts';

const started = { ownerKey: 'candidateA:session1', generation: 3, draftRevision: 7, photoRevision: 11 };
const current = (patch = {}) => ({ ...started, canAccessPrivateData: true, photoMutationInFlight: false, ...patch });

test('unchanged photo and canonical résumé remain eligible for PDF rendering and registration', () => {
  assert.equal(isResumePdfPhotoSnapshotCurrent(started, current()), true);
});

test('selection or deletion invalidates an in-flight PDF before canonical registration', () => {
  assert.equal(isResumePdfPhotoSnapshotCurrent(started, current({ photoMutationInFlight: true })), false);
  assert.equal(isResumePdfPhotoSnapshotCurrent(started, current({ photoRevision: 12 })), false);
});

test('session switch, private lock, reload or an unsaved résumé edit invalidates PDF snapshot', () => {
  for (const change of [
    { ownerKey: 'candidateB:session2' }, { ownerKey: 'candidateA:session2' },
    { generation: 4 }, { draftRevision: 8 }, { canAccessPrivateData: false },
  ]) assert.equal(isResumePdfPhotoSnapshotCurrent(started, current(change)), false);
  assert.equal(isResumePdfPhotoSnapshotCurrent({ ...started, ownerKey: '' }, current()), false);
});
