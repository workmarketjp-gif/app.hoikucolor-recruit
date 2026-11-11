// Native card wiring is checked against the approved Web component source.
// This is a source/behavior contract, not a rendered Android or iOS test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const card = readFileSync(new URL('../src/app/(tabs)/jobs.tsx', import.meta.url), 'utf8');
const web = readFileSync(new URL('../../src/components/JobCard.tsx', import.meta.url), 'utf8');
assert.match(web, /className="hc-job-head"/);
assert.match(web, /className="heart-button"/);
assert.match(web, /className="hc-job-tags"/);
assert.match(card, /import \{ jobSearchCardPresentation \} from '\.\.\/\.\.\/lib\/jobSearchCardPresentation';/);
assert.match(card, /const summary = jobSearchCardPresentation\(job\)/);
assert.match(card, /<View style=\{styles\.jobHead\}>/);
assert.match(card, /<CandidateTabIcon name="heart"/);
assert.match(card, /accessibilityState=\{\{ selected: saved, disabled: busy \}\}/);
assert.match(card, /disabled=\{busy\} onPress=\{onToggleSaved\}/);
assert.match(card, /summary\.location/);
assert.match(card, /summary\.isClosed/);
assert.match(card, /summary\.hasVerifiedWorkplace/);
assert.match(card, /summary\.hasVerifiedFinance/);
assert.match(card, /✓ 勤務実績あり/);
assert.match(card, /✓ 会計実績あり/);
assert.ok(card.indexOf('<Text style={styles.facility}>{job.facility_name}</Text>') <
  card.indexOf('<Text style={styles.jobTitle}>{job.title}</Text>'));
assert.ok(card.indexOf('<Text style={styles.salary}>{salary(job)}</Text>') <
  card.indexOf('<Text style={styles.meta}>{summary.location}</Text>'));
assert.doesNotMatch(card, /♡ 気になる/);

const result = spawnSync(process.execPath,
  ['--experimental-strip-types', '--test', 'qa/native-job-search-card-web-presentation.test.mjs'],
  { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('PASS Native job-search Web-summary source wiring');
