import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Screen-wiring assertions are static guards, NOT rendered Android/iOS QA.
const source = readFileSync(new URL('../src/app/application/[id].tsx', import.meta.url), 'utf8');
const styles = source.slice(source.indexOf('const styles = StyleSheet.create('));
const view = source.slice(source.indexOf('  const selectionTimeline ='), source.indexOf('      {error ?', source.indexOf('  const selectionTimeline =')));

test('Native application detail includes the canonical Web five-stage timeline', () => {
  assert.ok(source.includes("import { applicationSelectionTimeline, webNextScheduledInterview } from '../../lib/applicationSelectionTimeline';"));
  assert.match(view, /applicationSelectionTimeline\(detail\.application\.status\)/);
  assert.match(view, /testID="application-selection-timeline"/);
  assert.match(view, /selectionTimeline\.steps\.map/);
  assert.match(view, /selectionTimeline\.terminal/);
  assert.match(view, /selectionTimeline\.terminalMessage/);
  assert.ok(view.indexOf('selectionTimeline.steps.map') > view.indexOf('style={styles.heading}'));
});

test('Native timeline is usable at small widths without reducing stage label sizes', () => {
  assert.match(view, /horizontal\s+nestedScrollEnabled/);
  assert.match(view, /accessibilityLabel=\{\`\$\{step\.label\}/);
  assert.match(styles, /selectionCircleComplete: \{ borderColor: '#fb2f52'/);
  assert.match(styles, /selectionLabel: \{[^}]*fontSize: 14/);
  assert.match(styles, /selectionTerminalTitle: \{ fontSize: 17/);
});


test('Web next scheduled interview callout uses canonical interview data', () => {
  assert.ok(source.includes("import { applicationSelectionTimeline, webNextScheduledInterview }"));
  assert.ok(view.includes("webNextScheduledInterview(detail.interviews)"));
  assert.ok(view.includes("{nextInterview ? ("));
  assert.ok(view.includes('testID="application-next-interview"'));
  assert.ok(view.includes("formatApplicationEventDateTimeJapan(nextInterview.scheduled_at)"));
  assert.ok(view.includes("nextInterview.location"));
  assert.ok(view.includes("!nextInterview.candidate_response_status"));
  assert.ok(view.includes("日時を確認して回答してください"));
  assert.match(styles, /nextInterviewAlert: \{[^}]*fontSize: 14/);
});
