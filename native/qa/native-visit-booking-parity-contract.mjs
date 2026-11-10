// CI contract: use actual helper test and inspect the real screen (no framework stubs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = spawnSync(process.execPath, [
  '--experimental-strip-types', '--test', 'qa/native-visit-booking-web-parity.test.mjs',
], { cwd: root, encoding: 'utf8' });
if (run.status !== 0) {
  process.stderr.write(run.stdout + run.stderr);
  throw new Error('Native visit booking behavior regression failed');
}
const screen = readFileSync(path.join(root, 'src/app/visits.tsx'), 'utf8');
const checks = [
  /visitStartTimeSlots\(settings\)/,
  /currentJobVisitReservation\(visits, jobId\)/,
  /isSelectableVisitDateTime\(localDate, localTime, timeSlots\)/,
  /!activeJobReservation/,
  /timeSlots\.map\(/,
  /onPress=\{\(\) => setLocalTime\(time\)\}/,
  /accessibilityState=\{\{ selected: localTime === time \}\}/,
  /maxLength=\{1000\}/,
  /settings\.available_weekdays/,
  /settings\.what_to_bring/,
  /settings\.dress_code/,
  /activeJobReservation \?/,
];
for (const check of checks) assert.match(screen, check, 'Native visit booking screen wiring');
console.log('PASS Native visit booking: 6 real-source behavior cases, 12 screen wiring assertions');
