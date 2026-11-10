import assert from 'node:assert/strict';
import test from 'node:test';
import { isFreshApplicationWithdrawal } from '../src/lib/applicationDecisionDisclosure.ts';

const id = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const snapshot = (status, response = null, appId = id) => ({
  id: appId, status, candidate_offer_response: response,
});

for (const status of ['new', 'reviewing', 'interview', 'offered']) {
  test(`unchanged ${status} candidate decision remains eligible after canonical read`, () => {
    assert.equal(isFreshApplicationWithdrawal(snapshot(status), snapshot(status)), true);
  });
}
test('different application ID always fails closed', () => {
  assert.equal(isFreshApplicationWithdrawal(snapshot('new'), snapshot('new', null, otherId)), false);
});
test('canonical application status transition invalidates open confirmation', () => {
  assert.equal(isFreshApplicationWithdrawal(snapshot('reviewing'), snapshot('offered')), false);
  assert.equal(isFreshApplicationWithdrawal(snapshot('offered'), snapshot('hired')), false);
  assert.equal(isFreshApplicationWithdrawal(snapshot('offered'), snapshot('withdrawn')), false);
});
test('accepted-offer reversal must not silently reuse a prior unanswered-offer confirmation', () => {
  assert.equal(isFreshApplicationWithdrawal(snapshot('offered'), snapshot('offered', 'accepted')), false);
  assert.equal(isFreshApplicationWithdrawal(snapshot('offered', 'accepted'), snapshot('offered')), false);
});
test('identical accepted-offer state remains eligible for deliberate reversal', () => {
  assert.equal(isFreshApplicationWithdrawal(snapshot('offered', 'accepted'), snapshot('offered', 'accepted')), true);
});
test('missing, malformed, terminal or unknown canonical data never authorizes a durable action', () => {
  assert.equal(isFreshApplicationWithdrawal(null, snapshot('new')), false);
  assert.equal(isFreshApplicationWithdrawal(snapshot('new'), null), false);
  assert.equal(isFreshApplicationWithdrawal(snapshot('new'), { id, status: '', candidate_offer_response: null }), false);
  assert.equal(isFreshApplicationWithdrawal(snapshot('hired'), snapshot('hired')), false);
  assert.equal(isFreshApplicationWithdrawal(snapshot('unknown'), snapshot('unknown')), false);
  assert.equal(isFreshApplicationWithdrawal(snapshot('offered'), { id: '', status: 'offered' }), false);
});
test('missing and explicit null offer response are equivalent for older canonical readers', () => {
  assert.equal(isFreshApplicationWithdrawal(snapshot('offered'), { id, status: 'offered' }), true);
});
