// Behavioural suite: document-picker temp cache and resume-photo device cache ownership.
// Real documentPickerCache.ts + resumePhotoDeviceCache.ts + session fence; in-memory device storage.
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const stub = pathToFileURL(fileURLToPath(new URL('./fixtures/device-storage.stub.mjs', import.meta.url))).href;
const devicePackages = new Set(['expo-file-system', 'expo-secure-store', 'expo-crypto']);
registerHooks({ resolve(specifier, context, nextResolve) {
  if (devicePackages.has(specifier)) return nextResolve(stub, context);
  if (/^\.\/[A-Za-z]+$/.test(specifier) && context.parentURL?.includes('/src/lib/')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const cache = await import('../src/lib/documentPickerCache.ts');
const photo = await import('../src/lib/resumePhotoDeviceCache.ts');
const sess = await import('../src/lib/candidateLocalStateSession.ts');
const preview = await import('../src/lib/resumePhotoPreview.ts');
const { fsState } = await import('./fixtures/device-storage.stub.mjs');

const jpeg = readFileSync(new URL('./native-resume-photo-preview.test.mjs', import.meta.url), 'utf8').match(/const jpeg = "([^"]+)"/)[1];
const samplePhoto = () => preview.prepareResumePhotoPreview({ base64: jpeg, mimeType: 'image/jpeg', width: 600, height: 800 });
const pickUri = (n = 'a') => `file:///cache/DocumentPicker/${n}.pdf`;
const put = (uri) => fsState.files.set(uri, 'bytes');

beforeEach(() => { fsState.files.clear(); fsState.secure.clear(); fsState.failDelete.clear(); fsState.failSecureDelete = false;
  for (const u of ['A', 'B']) sess.unblockCandidateLocalStateSession(u, 's1'); });

// ---- picker temp cache -------------------------------------------------
test('only URIs inside the app cache are accepted as picker temp files', async () => {
  const gen = cache.captureDocumentPickerCacheGeneration();
  await assert.rejects(cache.registerPendingDocumentPickerCache('A', 'file:///storage/emulated/0/Download/x.pdf', gen), /安全な一時領域/);
  assert.throws(() => cache.discardUnregisteredDocumentPickerCache('file:///storage/emulated/0/x.pdf'), /安全な一時領域/);
  assert.equal(cache.isPrivateDocumentPickerCacheUri('file:///cache/x'), true);
  assert.equal(cache.isPrivateDocumentPickerCacheUri('file:///cachefoo/x'), false);
});
test('register, then consume by the same owner deletes the file and registry', async () => {
  put(pickUri());
  await cache.registerPendingDocumentPickerCache('A', pickUri(), cache.captureDocumentPickerCacheGeneration());
  assert.equal(fsState.secure.size, 1);
  await cache.consumePendingDocumentPickerCache('A', pickUri());
  assert.equal(fsState.files.has(pickUri()), false);
  assert.equal(fsState.secure.size, 0);
});
test('another owner cannot consume, or register over, a pending temp file', async () => {
  put(pickUri('a')); put(pickUri('b'));
  const gen = cache.captureDocumentPickerCacheGeneration();
  await cache.registerPendingDocumentPickerCache('A', pickUri('a'), gen);
  await assert.rejects(cache.consumePendingDocumentPickerCache('B', pickUri('a')), /登録を確認できません/);
  await assert.rejects(cache.registerPendingDocumentPickerCache('B', pickUri('b'), gen), /整理中/);
  assert.equal(fsState.files.has(pickUri('a')), true, 'A file untouched by B');
});
test('registering a file that does not exist fails and writes no registry', async () => {
  await assert.rejects(cache.registerPendingDocumentPickerCache('A', pickUri('missing'), cache.captureDocumentPickerCacheGeneration()), /確認できませんでした/);
  assert.equal(fsState.secure.size, 0);
});
test('a purge bumps the generation so a picker that returns afterwards cannot register', async () => {
  const gen = cache.captureDocumentPickerCacheGeneration();
  await cache.purgePendingDocumentPickerCache();
  put(pickUri());
  await assert.rejects(cache.registerPendingDocumentPickerCache('A', pickUri(), gen), (e) => e.message === cache.DOCUMENT_PICKER_CACHE_GENERATION_CHANGED);
  assert.equal(fsState.secure.size, 0);
});
test('purge deletes the pending file and registry, and reports whether it had work', async () => {
  put(pickUri());
  await cache.registerPendingDocumentPickerCache('A', pickUri(), cache.captureDocumentPickerCacheGeneration());
  assert.equal(await cache.purgePendingDocumentPickerCache(), true);
  assert.equal(fsState.files.has(pickUri()), false);
  assert.equal(await cache.purgePendingDocumentPickerCache(), false);
});
test('purge never reports success when the file cannot be deleted; the registry is kept for retry', async () => {
  put(pickUri());
  await cache.registerPendingDocumentPickerCache('A', pickUri(), cache.captureDocumentPickerCacheGeneration());
  fsState.failDelete.add(pickUri());
  await assert.rejects(cache.purgePendingDocumentPickerCache(), /削除できませんでした/);
  assert.equal(fsState.secure.size, 1);
  fsState.failDelete.clear();
  assert.equal(await cache.purgePendingDocumentPickerCache(), true);
});
test('a corrupt registry entry is dropped on purge rather than blocking sign-out', async () => {
  fsState.secure.set('hc.native.document-picker-cache.v1', '{not json');
  assert.equal(await cache.purgePendingDocumentPickerCache(), false);
  assert.equal(fsState.secure.size, 0);
});
test('a registry entry pointing outside the cache is ignored (cannot be used to delete other files)', async () => {
  fsState.secure.set('hc.native.document-picker-cache.v1', JSON.stringify({ userId: 'A', uri: 'file:///documents/important.pdf' }));
  fsState.files.set('file:///documents/important.pdf', 'keep');
  await cache.purgePendingDocumentPickerCache();
  assert.equal(fsState.files.has('file:///documents/important.pdf'), true);
});

// ---- resume photo device cache -----------------------------------------
test('saved photo round-trips for the same owner and is invisible to another owner', async () => {
  await photo.saveCachedResumePhoto('A', samplePhoto(), sess.captureCandidateLocalStateSessionLease('A', 's1'));
  const loaded = await photo.loadCachedResumePhoto('A');
  assert.equal(loaded.mimeType, 'image/jpeg');
  assert.equal(await photo.loadCachedResumePhoto('B'), null);
});
test('the cache filename holds no plain candidate identifier', async () => {
  await photo.saveCachedResumePhoto('candidate-A-secret', samplePhoto(), sess.captureCandidateLocalStateSessionLease('candidate-A-secret', 's1'));
  const names = [...fsState.files.keys()];
  assert.equal(names.length, 1);
  assert.ok(!names[0].includes('candidate-A-secret'));
});
test('a lease for a different owner cannot write or remove another owner photo', async () => {
  const leaseB = sess.captureCandidateLocalStateSessionLease('B', 's1');
  await assert.rejects(photo.saveCachedResumePhoto('A', samplePhoto(), leaseB), /OWNER_MISMATCH/);
  await assert.rejects(photo.removeCachedResumePhoto('A', leaseB), /OWNER_MISMATCH/);
  assert.equal(fsState.files.size, 0);
});
test('a write after the session was blocked (sign-out/account switch) is refused', async () => {
  const lease = sess.captureCandidateLocalStateSessionLease('A', 's1');
  sess.blockCandidateLocalStateSession('A', 's1');
  await assert.rejects(photo.saveCachedResumePhoto('A', samplePhoto(), lease), /SESSION_CHANGED/);
});
test('tampered cache content is rejected on load instead of displayed', async () => {
  await photo.saveCachedResumePhoto('A', samplePhoto(), sess.captureCandidateLocalStateSessionLease('A', 's1'));
  const [uri] = [...fsState.files.keys()];
  fsState.files.set(uri, '{"garbage":true}');
  await assert.rejects(photo.loadCachedResumePhoto('A'));
});
test('explicit remove deletes the file; purge removes it too and fails if it cannot', async () => {
  const lease = sess.captureCandidateLocalStateSessionLease('A', 's1');
  await photo.saveCachedResumePhoto('A', samplePhoto(), lease);
  await photo.removeCachedResumePhoto('A', lease);
  assert.equal(fsState.files.size, 0);
  await photo.saveCachedResumePhoto('A', samplePhoto(), lease);
  const [uri] = [...fsState.files.keys()];
  fsState.failDelete.add(uri);
  await assert.rejects(photo.purgeCachedResumePhoto('A'), /削除できませんでした/);
  fsState.failDelete.clear();
  await photo.purgeCachedResumePhoto('A');
  assert.equal(fsState.files.size, 0);
});
test('photo owner id is required', async () => {
  await assert.rejects(photo.loadCachedResumePhoto('  '), /AUTH_REQUIRED/);
});
