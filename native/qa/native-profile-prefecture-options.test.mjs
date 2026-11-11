import assert from 'node:assert/strict';
import test from 'node:test';
import { PROFILE_PREFECTURES, profilePrefectureChoices } from '../src/lib/profilePrefectureOptions.ts';

test('Web list contains exactly the 47 selectable prefectures in approved order', () => {
  assert.equal(PROFILE_PREFECTURES.length, 47);
  assert.equal(new Set(PROFILE_PREFECTURES).size, 47);
  assert.equal(PROFILE_PREFECTURES[0], '北海道');
  assert.equal(PROFILE_PREFECTURES[12], '東京都');
  assert.equal(PROFILE_PREFECTURES.at(-1), '沖縄県');
});

test('no selection and known selection do not invent a value or mutate canonical options', () => {
  for (const current of [null, undefined, '', '東京都']) {
    assert.deepEqual(profilePrefectureChoices(current), PROFILE_PREFECTURES);
  }
  const copy = profilePrefectureChoices(null);
  copy.pop();
  assert.equal(PROFILE_PREFECTURES.length, 47);
});

test('unknown existing values remain editable like Web rather than disappearing', () => {
  const values = profilePrefectureChoices('旧行政区分');
  assert.equal(values.length, 48);
  assert.equal(values[0], '旧行政区分');
  assert.deepEqual(values.slice(1), PROFILE_PREFECTURES);
});
