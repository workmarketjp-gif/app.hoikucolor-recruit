import assert from 'node:assert/strict';
import test from 'node:test';
import { readScoutClock, writeScoutClock } from '../src/lib/scoutTimeSelection.ts';

test('24-hour time selection has exact Web HH:mm semantics', () => {
  for (const [h,m] of [[0,0],[8,5],[12,30],[23,59]]) {
    assert.deepEqual(readScoutClock(writeScoutClock(h,m)),{hour:h,minute:m});
  }
  assert.equal(writeScoutClock(8,5), '08:05');
  assert.equal(writeScoutClock(23,59),'23:59');
});

test('unset time is distinct from midnight and never silently filled', () => {
  assert.equal(readScoutClock(null),null);
  assert.deepEqual(readScoutClock('00:00'),{hour:0,minute:0});
});

test('invalid existing times fail visibly rather than becoming a fabricated selection', () => {
  for (const str of ['', '8:00','24:00','23:60','12:30:00',' 08:00','08:00 ', '09:00Z']) {
    assert.throws(()=>readScoutClock(str),/勤務可能時間/,str);
  }
});

test('invalid picker indices and float/NaN/infinite hours and minutes cannot be committed', () => {
  for (const [h,m] of [[-1,0],[24,0],[2,-1],[2,60],[1.5,0],[0,1.1],[NaN,0],[0,Infinity]]) {
    assert.throws(()=>writeScoutClock(h,m),/勤務可能時間/);
  }
});
