import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app/application/[id].tsx', import.meta.url), 'utf8');

test('withdrawal is an explicit two-stage destructive action', () => {
  assert.match(source, /applicationDecisionDisclosure\(detail\.application\.status, detail\.application\.candidate_offer_response\)/);
  assert.match(source, /const \[withdrawOpen, setWithdrawOpen\] = useState\(false\)/);
  assert.match(source, /setWithdrawOpen\(true\)/);
  assert.match(source, /decisionDisclosure\.confirmationWarning/);
  assert.match(source, /辞退を確定する/);
  assert.match(source, /onPress=\{\(\) => void withdrawCurrentApplication\(\)\}/);
  assert.match(source, /setWithdrawOpen\(false\);\s+setWithdrawReason\(''\)/);
  assert.doesNotMatch(source, /onPress=\{\(\) => void withdrawCurrentApplication\(\)\}[\s\S]{0,150}内定を辞退する/);
});

test('withdrawal RPC additionally enforces confirmation and pinned session', () => {
  const handler = source.slice(source.indexOf('  const withdrawCurrentApplication = async () => {'), source.indexOf('  const repairDocuments = async () => {'));
  assert.match(handler, /canConfirmApplicationWithdrawal\(/);
  assert.match(handler, /await pinCandidateAction\(\)/);
  assert.match(handler, /!pinned\.isCurrent\(\) \|\| !stillCurrent\(\)/);
  assert.match(handler, /await withdrawApplication\(pinned\.client, applicationId, withdrawReason\)/);
  assert.match(handler, /setWithdrawOpen\(false\)/);
});

test('Web-equivalent accepted offer and cancel control remain visible', () => {
  assert.match(source, /decisionDisclosure\.accepted/);
  assert.match(source, /decisionDisclosure\.withdrawLabel/);
  assert.match(source, /decisionDisclosure\.canAccept/);
  assert.match(source, /辞退理由・園への連絡（任意）/);
  assert.match(source, /やめる/);
  assert.match(source, /内定を承諾する/);
});
