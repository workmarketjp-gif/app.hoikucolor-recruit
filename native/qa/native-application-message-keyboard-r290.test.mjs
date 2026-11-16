import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// This is a source/config regression; it does not prove native keyboard rendering.
const detail = readFileSync(new URL('../src/app/application/[id].tsx', import.meta.url), 'utf8');
const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));

test('iOS application thread opts in to keyboard-adjusted ScrollView insets', () => {
  assert.match(detail, /<ScrollView\\s+ref=\\{messageScrollRef\\}[\\s\\S]*?automaticallyAdjustKeyboardInsets/);
  assert.match(detail, /keyboardDismissMode="on-drag"/);
  assert.match(detail, /keyboardShouldPersistTaps="handled"/);
});

test('Android keyboard uses resize rather than panning private message actions', () => {
  assert.equal(config.expo.android.softwareKeyboardLayoutMode, 'resize');
});

test('existing private message input, send guard and canonical review remain attached', () => {
  assert.match(detail, /<TextInput\\s+value=\\{messageDraft\\}/);
  assert.match(detail, /multiline\\s+maxLength=\\{4000\\}/);
  assert.match(detail, /sendApplicationMessageDurable\\(\\{/);
  assert.match(detail, /reviewMessageSend = async \\(\\) =>/);
  assert.match(detail, /messagesLoading \\|\\| messagesReadError \\|\\| !canSubmitCandidateMessage\\(\\{/);
});

test('keyboard change does not bypass visible-message read acknowledgement', () => {
  assert.match(detail, /readViewportRef\\.current = \\{[\\s\\S]*?scrollY: Math\\.max\\(0, event\\.nativeEvent\\.contentOffset\\.y\\)/);
  assert.match(detail, /maybeAcknowledgeVisibleFacilityMessage\\(\\)/);
});
