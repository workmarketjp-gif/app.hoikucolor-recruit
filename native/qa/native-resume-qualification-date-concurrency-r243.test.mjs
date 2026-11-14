import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setResumeQualification, updateResumeQualificationAcquiredDate, pruneResumeQualificationAcquiredDates,
  RESUME_PROFILE_QUALIFICATION_LIMIT,
} from '../src/lib/resumeLinkedProfilePolicy.ts';

const BASE = ['保育士', '幼稚園教諭', '海外資格'];

test('two rapid date picks operate on the current draft, keeping both qualifications', () => {
  let state = { '海外資格': '2015-09' };
  const queued = [
    (current) => updateResumeQualificationAcquiredDate(current, BASE, '保育士', '2020-03'),
    (current) => updateResumeQualificationAcquiredDate(current, BASE, '幼稚園教諭', '2021-08'),
  ];
  for (const fn of queued) state = fn(state);
  assert.deepEqual(state, { '海外資格': '2015-09', '保育士': '2020-03', '幼稚園教諭': '2021-08' });
});

test('updating and clearing one date keeps other dates and source unchanged', () => {
  const old = { '保育士': '2020-03', '海外資格': '2015-09' };
  const updated = updateResumeQualificationAcquiredDate(old, BASE, '保育士', '2022-05');
  const cleared = updateResumeQualificationAcquiredDate(updated, BASE, '保育士', null);
  assert.deepEqual(old, { '保育士': '2020-03', '海外資格': '2015-09' });
  assert.deepEqual(cleared, { '海外資格': '2015-09' });
});

test('stale picker callback cannot resurrect a removed qualification date', () => {
  const original = { '保育士': '2020-03', '幼稚園教諭': '2021-08' };
  const selected = ['幼稚園教諭'];
  let latest = pruneResumeQualificationAcquiredDates(original, selected);
  latest = updateResumeQualificationAcquiredDate(latest, selected, '保育士', '2026-11');
  assert.deepEqual(latest, { '幼稚園教諭': '2021-08' });
});

test('rapid selection toggles use the latest qualifications and preserve custom qualifications', () => {
  let selected = ['海外資格'];
  for (const name of ['保育士', '幼稚園教諭']) {
    selected = setResumeQualification(selected, {}, name, true).qualifications;
  }
  assert.deepEqual(selected, ['海外資格', '保育士', '幼稚園教諭']);
  selected = setResumeQualification(selected, {}, '保育士', false).qualifications;
  assert.deepEqual(selected, ['海外資格','幼稚園教諭']);
});

test('deleting a qualification prunes only its own date from the live draft', () => {
  const old = { '海外資格': '2015-09', '保育士': '2020-03', '幼稚園教諭': '2021-08' };
  assert.deepEqual(pruneResumeQualificationAcquiredDates(old, ['海外資格', '保育士']), {
    '海外資格': '2015-09', '保育士': '2020-03',
  });
});

test('unselected, blank and already current date operations are no-ops', () => {
  const state = { '保育士': '2020-03' };
  assert.strictEqual(updateResumeQualificationAcquiredDate(state, BASE, '保育士', '2020-03'), state);
  assert.strictEqual(updateResumeQualificationAcquiredDate(state, BASE, 'missing', '2022-02'), state);
  assert.strictEqual(updateResumeQualificationAcquiredDate(state, BASE, ' ', '2022-02'), state);
  assert.strictEqual(pruneResumeQualificationAcquiredDates(state, BASE), state);
});

test('qualification max count still applies to consecutive changes', () => {
  let selected = Array.from({length:RESUME_PROFILE_QUALIFICATION_LIMIT - 1}, (_,i)=>`資格${i}`);
  selected = setResumeQualification(selected,{},'保育士',true).qualifications;
  assert.throws(()=>setResumeQualification(selected,{},'幼稚園教諭',true),/50件/);
});

test('queued picker update consults the live selection after a different event removes that qualification', () => {
  const selection = { current: ['保育士', '幼稚園教諭'] };
  const pendingDateChange = (current) =>
    updateResumeQualificationAcquiredDate(current, selection.current, '保育士', '2026-11');
  let latest = { '保育士': '2020-03', '幼稚園教諭': '2021-08' };
  selection.current = ['幼稚園教諭'];
  latest = pruneResumeQualificationAcquiredDates(latest, selection.current);
  latest = pendingDateChange(latest);
  assert.deepEqual(latest, { '幼稚園教諭': '2021-08' });
});
