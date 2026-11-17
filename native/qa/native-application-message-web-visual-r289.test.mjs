import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source-only Web/Native comparison. This does not replace Android/iOS rendered QA.
const native = readFileSync(new URL('../src/app/application/[id].tsx', import.meta.url), 'utf8');
const webMessages = readFileSync(new URL('../../src/views/views.css', import.meta.url), 'utf8');
const webShell = readFileSync(new URL('../../src/candidate-shell.css', import.meta.url), 'utf8');

test('approved Web accent is the Native application action fill', () => {
  assert.match(webShell, /--hc-accent:\s*var\(--accent,\s*#fb2f52\)/);
  assert.match(native, /primaryButton:\s*\{[^}]*minHeight:\s*52[^}]*backgroundColor:\s*'#fb2f52'/);
  assert.match(native, /primaryText:\s*\{[^}]*fontSize:\s*16/);
});

test('Web candidate action minimum height is preserved', () => {
  assert.match(webShell, /\.hc-shell \.primary-button, \.hc-shell \.secondary-button\s*\{\s*min-height:\s*52px/);
  assert.match(native, /primaryButton:\s*\{[^}]*minHeight:\s*52/);
});

test('Web candidate reply bubble uses accent-soft, not unrelated blue', () => {
  assert.match(webMessages, /\.hc-message\.is-mine\s*\{[^}]*background:\s*var\(--hc-accent-soft\)/);
  assert.match(native, /myMessage:\s*\{[^}]*backgroundColor:\s*'#fff0f3'/);
  assert.doesNotMatch(native, /myMessage:\s*\{[^}]*#edf4ff/);
});

test('facility bubble is the bordered white Web counterpart', () => {
  assert.match(webMessages, /\.hc-message\s*\{[^}]*border:\s*1px solid var\(--hc-line\);\s*background:\s*#fff/);
  assert.match(native, /message:\s*\{[^}]*backgroundColor:\s*'#fff'[^}]*borderWidth:\s*1[^}]*borderColor:\s*'#e7e8eb'/);
});

test('message body and metadata follow Web readable type sizes', () => {
  assert.match(webMessages, /\.hc-message p\s*\{[^}]*font-size:\s*15px/);
  assert.match(webMessages, /\.hc-message small\s*\{[^}]*font-size:\s*14px/);
  assert.match(native, /<Text style=\{styles\.messageBody\}>\{message\.body\}<\/Text>/);
  assert.match(native, /messageBody:\s*\{[^}]*fontSize:\s*15/);
  assert.match(native, /messageMeta:\s*\{[^}]*fontSize:\s*14/);
  assert.match(native, /<Text style=\{styles\.messageRole\}>\{applicationMessageWebMeta\(message\.sender_role, message\.created_at\)\}<\/Text>/);
  assert.doesNotMatch(native, /<Text style=\{styles\.messageMeta\}>\{formatDateTime\(message\.created_at\)\}<\/Text>/);
});

test('message composer matches Web minimum size while retaining 4000 character bound', () => {
  assert.match(webMessages, /\.hc-message-compose textarea\s*\{\s*min-height:\s*96px/);
  assert.match(native, /style=\{\[styles\.textArea, styles\.messageTextArea\]\}/);
  assert.match(native, /messageTextArea:\s*\{ minHeight:\s*96 \}/);
  assert.match(native, /maxLength=\{4000\}/);
  assert.match(native, /<Text style=\{styles\.messageMeta\}>\{messageDraft\.length\}\/4000<\/Text>/);
});

test('focused thread uses brand identity rather than unrelated blue', () => {
  assert.match(native, /focusedCard:\s*\{[^}]*borderColor:\s*'#fb2f52'/);
  assert.match(native, /focusLabel:\s*\{[^}]*color:\s*'#c8173a'/);
});

test('canonical durable send and review actions stay wired', () => {
  assert.match(native, /sendApplicationMessageDurable\(\{/);
  assert.match(native, /reviewMessageSend = async \(\) =>/);
  assert.match(native, /onPress=\{\(\) => void sendMessage\(\)\}/);
  assert.match(native, /onPress=\{\(\) => void reviewMessageSend\(\)\}/);
});
