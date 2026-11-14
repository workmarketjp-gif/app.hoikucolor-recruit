import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resumePhotoFailureNotice, UNCONFIRMED_RESUME_PHOTO_NOTICE } from '../src/lib/resumePhotoFailurePresentation.ts';

test('picker/type/size validation retains reviewed Japanese guidance', () => {
  for (const message of [
    '写真はJPEGまたはPNGの画像を選んでください。',
    '写真は10MB以下の画像を選んでください。',
    '透過のあるPNGは使えません。JPEGの写真、または背景が透過していない画像を選んでください。',
    '写真を600×800に整えられませんでした。もう一度選んでください。',
  ]) {
    assert.equal(resumePhotoFailureNotice(new Error(message)), message);
  }
});

test('cache and temporary-file failures retain exact reviewed messages', () => {
  assert.equal(resumePhotoFailureNotice(new Error('証明写真の端末保存を確認できませんでした。')),
    '証明写真の端末保存を確認できませんでした。');
  assert.equal(resumePhotoFailureNotice(new Error('写真の一時ファイルを削除できませんでした。')),
    '写真の一時ファイルを削除できませんでした。');
});

test('OS/filesystem/manipulation exceptions never expose paths or candidate identity', () => {
  for (const cause of [
    new Error('Could not open file:///data/user/0/host/cache/Clerk/user-A_photo.jpg'),
    new Error('image manipulation rejected with base64=private.jpg'),
    new Error('CANDIDATE_LOCAL_STATE_OWNER_MISMATCH candidate-A'),
    new Error('expo-file-system Error private-cache/uid-B.json'),
    { message: 'private candidate identifier B' }, null, 12, 'private path',
  ]) {
    assert.equal(resumePhotoFailureNotice(cause), UNCONFIRMED_RESUME_PHOTO_NOTICE);
  }
});

test('untrusted prefixes or suffixes to safe text cannot bypass sanitization', () => {
  assert.equal(resumePhotoFailureNotice(new Error('写真は10MB以下の画像を選んでください。 id=user-A')),
    UNCONFIRMED_RESUME_PHOTO_NOTICE);
  assert.equal(resumePhotoFailureNotice(new Error('file:///tmp/ 写真の一時ファイルを削除できませんでした。')),
    UNCONFIRMED_RESUME_PHOTO_NOTICE);
});

test('an Error subclass getter cannot crash UI or disclose private details', () => {
  class MaliciousError extends Error { get message() { throw new Error('private path'); } }
  assert.equal(resumePhotoFailureNotice(new MaliciousError()), UNCONFIRMED_RESUME_PHOTO_NOTICE);
});

test('fallback reports uncertainty, not false confirmation of cache save/removal', () => {
  const message = resumePhotoFailureNotice(new Error('private path'));
  assert.match(message, /保存状態を確認できない/);
  assert.doesNotMatch(message, /保存しました|削除しました|アップロードしました/);
});
