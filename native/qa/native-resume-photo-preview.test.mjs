import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareResumePhotoPreview, canPresentResumePhoto, RESUME_PHOTO_MAX_BYTES } from '../src/lib/resumePhotoPreview.ts';

const jpeg = '/9j/AA==';
const png = 'iVBORw0KGgo=';
const photo = (overrides = {}) => ({ base64: jpeg, mimeType: 'image/jpeg', width: 600, height: 800, ...overrides });
const lease = (overrides = {}) => ({ startedOwner: 'candidateA:session1', currentOwner: 'candidateA:session1', loadedOwner: 'candidateA:session1',
  startedGeneration: 7, currentGeneration: 7, privateAllowed: true, screenActive: true, ...overrides });

test('JPEG preview stays in memory and reports exact byte count', () => {
  assert.deepEqual(prepareResumePhotoPreview(photo()), {
    dataUri: `data:image/jpeg;base64,${jpeg}`, mimeType: 'image/jpeg', byteLength: 4, width: 600, height: 800,
  });
});
test('PNG is accepted without treating it as JPEG', () => {
  const result = prepareResumePhotoPreview(photo({ base64: png, mimeType: 'image/png' }));
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.byteLength, 8);
});
test('reported MIME cannot override file signature', () => {
  assert.throws(() => prepareResumePhotoPreview(photo({ base64: png })), /一致/);
  assert.throws(() => prepareResumePhotoPreview(photo({ base64: jpeg, mimeType: 'image/png' })), /一致/);
});
test('unknown and unapproved formats fail closed', () => {
  assert.throws(() => prepareResumePhotoPreview(photo({ mimeType: 'image/heic' })), /JPEG/);
  assert.throws(() => prepareResumePhotoPreview(photo({ mimeType: null })), /JPEG/);
});
test('invalid base64 and dimensions fail without a preview URI', () => {
  for (const bad of ['', '/9j/$$==', ' /9j/AA==', '/9j/AA=']) assert.throws(() => prepareResumePhotoPreview(photo({ base64: bad })), /読み込めません/);
  for (const width of [0, -2, 0.5, Infinity]) assert.throws(() => prepareResumePhotoPreview(photo({ width })), /サイズ/);
});
test('oversized images are rejected before constructing a data URI', () => {
  const over = '/9j/' + 'A'.repeat(Math.ceil((RESUME_PHOTO_MAX_BYTES + 4) * 4 / 3 / 4) * 4);
  assert.throws(() => prepareResumePhotoPreview(photo({ base64: over })), /10MB/);
});
test('owner and session identity both fence stale picker results', () => {
  assert.equal(canPresentResumePhoto(lease()), true);
  for (const overrides of [{ currentOwner: 'candidateB:session2' }, { loadedOwner: 'candidateB:session2' },
    { currentOwner: 'candidateA:session2' }, { startedOwner: null }]) assert.equal(canPresentResumePhoto(lease(overrides)), false);
});
test('screen blur, App Lock and generation change all reject late photos', () => {
  for (const overrides of [{ screenActive: false }, { privateAllowed: false }, { currentGeneration: 8 }]) {
    assert.equal(canPresentResumePhoto(lease(overrides)), false);
  }
});
