import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationDecisionDisclosure, canConfirmApplicationWithdrawal } from '../src/lib/applicationDecisionDisclosure.ts';

for (const status of ['new', 'reviewing', 'interview']) {
  test(`${status}: withdrawal requires a second explicit confirmation`, () => {
    const model = applicationDecisionDisclosure(status, null);
    assert.equal(model.heading, '応募の辞退');
    assert.equal(model.withdrawLabel, '応募を辞退する');
    assert.equal(model.confirmationWarning, '辞退すると、この応募は取り消せません。');
    assert.equal(model.canAccept, false);
    assert.equal(canConfirmApplicationWithdrawal(status, null, false), false);
    assert.equal(canConfirmApplicationWithdrawal(status, null, true), true);
  });
}

test('unanswered offer separates accepting an offer from withdrawal', () => {
  const model = applicationDecisionDisclosure('offered', null);
  assert.equal(model.heading, '内定への回答');
  assert.equal(model.canAccept, true);
  assert.equal(model.withdrawLabel, '内定を辞退する');
  assert.equal(model.confirmationWarning, '辞退すると、この内定は取り消せません。');
  assert.equal(canConfirmApplicationWithdrawal('offered', null, false), false);
});

test('accepted offer still permits explicit withdrawal with accurate disclosure', () => {
  const model = applicationDecisionDisclosure('offered', 'accepted');
  assert.equal(model.accepted, true);
  assert.equal(model.canAccept, false);
  assert.equal(model.withdrawLabel, '承諾を取り消して辞退する');
  assert.equal(model.confirmationWarning, '辞退すると、この内定は取り消せません。');
  assert.equal(canConfirmApplicationWithdrawal('offered', 'accepted', true), true);
});

for (const status of ['hired', 'rejected', 'withdrawn', 'applied', 'screening', 'offer', '', 'unknown']) {
  test(`nonwithdrawable ${status || '<empty>'}: no opener and no confirm path`, () => {
    assert.equal(applicationDecisionDisclosure(status, null), null);
    assert.equal(canConfirmApplicationWithdrawal(status, null, true), false);
  });
}

test('missing status fails closed even after a confirmation was previously displayed', () => {
  assert.equal(applicationDecisionDisclosure(undefined, 'accepted'), null);
  assert.equal(canConfirmApplicationWithdrawal(undefined, 'accepted', true), false);
  assert.equal(canConfirmApplicationWithdrawal(null, null, true), false);
});
