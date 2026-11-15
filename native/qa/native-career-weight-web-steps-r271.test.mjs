import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WEB_CAREER_WEIGHT_CHOICES,
  WEB_CAREER_WEIGHT_STEP,
  visibleCareerWeightChoices,
} from '../src/lib/careerSalaryWeightChoices.ts';

test('Web 0–100% step=10 range is completely selectable', () => {
  assert.equal(WEB_CAREER_WEIGHT_STEP, 10);
  assert.deepEqual([...WEB_CAREER_WEIGHT_CHOICES], [0,10,20,30,40,50,60,70,80,90,100]);
  assert.equal(new Set(WEB_CAREER_WEIGHT_CHOICES).size, 11);
  assert.equal(Object.isFrozen(WEB_CAREER_WEIGHT_CHOICES), true);
});

test('default 50% and the selected Web steps never gain duplicates', () => {
  for (const weight of WEB_CAREER_WEIGHT_CHOICES) {
    assert.strictEqual(visibleCareerWeightChoices(weight), WEB_CAREER_WEIGHT_CHOICES);
  }
});

test('legacy 25% and 75% remain selectable without mutating canonical data', () => {
  assert.deepEqual([...visibleCareerWeightChoices(25)], [0,10,20,25,30,40,50,60,70,80,90,100]);
  assert.deepEqual([...visibleCareerWeightChoices(75)], [0,10,20,30,40,50,60,70,75,80,90,100]);
});

test('other existing server values are preserved only if finite and within range', () => {
  assert.deepEqual([...visibleCareerWeightChoices(27.5)].filter(n => n === 27.5), [27.5]);
  for (const weight of [Number.NaN, Infinity, -Infinity, -5, 150]) {
    assert.strictEqual(visibleCareerWeightChoices(weight), WEB_CAREER_WEIGHT_CHOICES);
  }
});

test('caller cannot mutate the default choices after reading them', () => {
  assert.throws(() => WEB_CAREER_WEIGHT_CHOICES.push(110), TypeError);
  assert.deepEqual([...visibleCareerWeightChoices(75)].filter(n => n === 75), [75]);
});
