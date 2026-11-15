import assert from 'node:assert/strict';
import test from 'node:test';
import { careerValuesPath } from '../src/lib/careerValuesPath.ts';

test('unselected values offer only the canonical preferences route, not an unqualified match', () => {
  const view = careerValuesPath([]);
  assert.equal(view.primaryRoute, '/scouts');
  assert.equal(view.primaryLabel, '大切にしたい保育を選ぶ');
  assert.equal(view.secondaryLabel, null);
  assert.deepEqual(view.values, []);
  assert.match(view.introduction, /あとから変えられます/);
});

test('selected values show matching and edit actions in the Web order', () => {
  const values = ['自然体験', '子ども主体の保育'];
  const view = careerValuesPath(values);
  assert.equal(view.primaryRoute, '/matches');
  assert.equal(view.primaryLabel, '保育観に合う求人を見る');
  assert.equal(view.secondaryLabel, '大切にしたい保育を見直す');
  assert.equal(view.introduction, 'あなたが大切にしたい保育です。');
});

test('preserves backend-owned Japanese preference strings, order and identity without inferred evidence', () => {
  const original = Object.freeze(['  子ども主体  ', '長い保育観・0件と推測しない', '自然体験']);
  const before = [...original];
  const view = careerValuesPath(original);
  assert.equal(view.values, original);
  assert.deepEqual(view.values, before);
  assert.equal('matchCount' in view, false);
  assert.equal('verified' in view, false);
});

test('switching from selected to cleared state does not retain matching privilege', () => {
  assert.equal(careerValuesPath(['自然体験']).primaryRoute, '/matches');
  assert.equal(careerValuesPath([]).primaryRoute, '/scouts');
});
