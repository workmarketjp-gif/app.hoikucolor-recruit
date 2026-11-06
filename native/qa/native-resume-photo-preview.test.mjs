import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === './resumePhotoSanitizer' ? './resumePhotoSanitizer.ts' : specifier, context);
} });
const { prepareResumePhotoPreview, canPresentResumePhoto, RESUME_PHOTO_MAX_BYTES } = await import('../src/lib/resumePhotoPreview.ts');

const jpeg = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC";
const photo = (overrides = {}) => ({ base64: jpeg, mimeType: 'image/jpeg', width: 600, height: 800, ...overrides });
const lease = (overrides = {}) => ({ startedOwner: 'candidateA:session1', currentOwner: 'candidateA:session1', loadedOwner: 'candidateA:session1',
  startedGeneration: 7, currentGeneration: 7, privateAllowed: true, screenActive: true, ...overrides });

test('JPEG preview stays in memory and reports exact byte count', () => {
  const preview = prepareResumePhotoPreview(photo());
  assert.deepEqual({ ...preview, dataUri: preview.dataUri.slice(0, 23) }, {
    dataUri: 'data:image/jpeg;base64,', mimeType: 'image/jpeg',
    byteLength: Buffer.from(preview.dataUri.split(',')[1], 'base64').length, width: 1, height: 1,
  });
  assert.equal(Buffer.from(preview.dataUri.split(',')[1], 'base64').includes(Buffer.from('JFIF')), false);
  assert.ok(preview.byteLength < Buffer.from(jpeg, 'base64').length); 
});
test('PNG is accepted without treating it as JPEG', () => {
  const result = prepareResumePhotoPreview(photo({ base64: png, mimeType: 'image/png' }));
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.byteLength, Buffer.from(png, 'base64').length);
});
test('reported MIME cannot override file signature', () => {
  assert.throws(() => prepareResumePhotoPreview(photo({ base64: png })), /一致/);
  assert.throws(() => prepareResumePhotoPreview(photo({ base64: jpeg, mimeType: 'image/png' })), /一致/);
});
test('unknown and unapproved formats fail closed', () => {
  assert.throws(() => prepareResumePhotoPreview(photo({ mimeType: 'image/heic' })), /JPEG/);
  assert.throws(() => prepareResumePhotoPreview(photo({ mimeType: null })), /JPEG/);
});
test('invalid base64 fails without a preview URI', () => {
  for (const bad of ['', '/9j/$$==', ' /9j/AA==', '/9j/AA=']) assert.throws(() => prepareResumePhotoPreview(photo({ base64: bad })), /読み込めません/);
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

test('picker dimensions are not trusted when the sanitized JPEG/PNG is actually 1×1', () => {
  const jpg = prepareResumePhotoPreview(photo({ width: 600, height: 800 }));
  const image = prepareResumePhotoPreview(photo({ base64: png, mimeType: 'image/png', width: 300, height: 400 }));
  assert.deepEqual([jpg.width, jpg.height, image.width, image.height], [1, 1, 1, 1]);
});

test('valid source pixels take priority even when OS reports invalid size', () => {
  for (const width of [0, -2, 0.5, Infinity]) {
    const result = prepareResumePhotoPreview(photo({ width, height: 0 }));
    assert.deepEqual([result.width, result.height], [1, 1]);
  }
});
