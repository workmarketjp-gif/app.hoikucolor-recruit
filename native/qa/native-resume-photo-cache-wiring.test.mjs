import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const screen = source('../src/app/resume.tsx');
const cache = source('../src/lib/resumePhotoDeviceCache.ts');
const purge = source('../src/lib/candidateLocalPrivacyPurge.ts');

// Native SDK and filesystem runtime are not mocked here. These checks verify
// only source integration, not device durability, signing or visual parity.
test('picker cache write must complete before candidate can see retained photo', () => {
  const pick = screen.slice(screen.indexOf('  const pickResumePhoto'), screen.indexOf('  const removeResumePhoto'));
  assert.match(pick, /captureCandidateLocalStateSessionLease\(photoOwnerId, session\.id\)/);
  assert.match(pick, /await saveCachedResumePhoto\(photoOwnerId, prepared, lease\)/);
  assert.ok(pick.indexOf('await saveCachedResumePhoto(') < pick.indexOf('setPhotoPreview(prepared)'));
  assert.match(pick, /if \(!stillEligible\(\)\) return;/);
});
test('resume requires canonical owner before restoring an untrusted cached photo', () => {
  assert.match(screen, /const canonical = await getCandidateResume\(pinned\.client\)/);
  assert.match(screen, /cached = await loadCachedResumePhoto\(pinned\.ownerId\)/);
  assert.match(screen, /if \(!pinned\.isCurrent\(\) \|\| !live\(expectedOwner, request\)\) return;\s*setResume\(canonical\)/);
  assert.match(cache, /prepareResumePhotoPreview\(record\)/);
});
test('photo removal is a physical session-leased delete, not only a UI reset', () => {
  assert.match(screen, /await removeCachedResumePhoto\(session\.user\.id, lease\)/);
  assert.match(cache, /withCandidateLocalStateWrite\(lease, \(\) => physicallyRemovePhoto\(userId\)\)/);
  assert.match(cache, /if \(file\.exists\) throw new Error\('端末内の証明写真を削除できませんでした。'\)/);
});
test('explicit sign-out and deletion handoff attempts physical photo purge and can fail closed', () => {
  assert.match(purge, /\['resume-photo-cache', \(\) => purgeCachedResumePhoto\(ownerId\)\]/);
  assert.match(purge, /Promise\.allSettled\(operations\.map/);
  assert.match(purge, /CANDIDATE_LOCAL_PRIVACY_PURGE_INCOMPLETE/);
  assert.match(cache, /new File\(Paths\.cache,/);
  assert.doesNotMatch(cache, /Paths\.document|fetch\(|supabase|upload|console\./);
});
