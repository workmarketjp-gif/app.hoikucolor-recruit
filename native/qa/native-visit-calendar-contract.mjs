// CI source-wiring guard. This is not an Android/iOS rendering or touch test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helperTest = spawnSync(process.execPath, ['--experimental-strip-types', '--test', 'qa/native-visit-calendar-selection.test.mjs'],
  { cwd: root, encoding: 'utf8' });
if (helperTest.status !== 0) {
  process.stderr.write(helperTest.stdout + helperTest.stderr);
  throw new Error('Venue-calendar selection behavior failed');
}
const screen = readFileSync(path.join(root, 'src/app/visits.tsx'), 'utf8');
const calendar = readFileSync(path.join(root, 'src/components/VisitDateCalendar.tsx'), 'utf8');
for (const pattern of [
  /<VisitDateCalendar/, /value=\{localDate\}/, /onChange=\{setLocalDate\}/,
  /availableWeekdays=\{settings\.available_weekdays/, /maxDaysAhead=\{settings\.max_days_ahead\}/,
  /isSelectableVisitCalendarDay\(localDate, Date\.now\(\), settings\.max_days_ahead, settings\.available_weekdays/,
]) assert.match(screen, pattern, 'Native visit screen calendar wiring');
for (const pattern of [
  /visitCalendarCells\(month\)/, /isSelectableVisitCalendarDay\(day, now, maxDaysAhead, availableWeekdays\)/,
  /accessibilityState=\{\{ selected, disabled: !enabled \}\}/,
  /onChange\(day\)/, /width: 322/, /showsHorizontalScrollIndicator/,
]) assert.match(calendar, pattern, 'Calendar UI and accessibility contract');
console.log('PASS 6 venue-calendar behavior cases + 12 Native source wiring checks');
