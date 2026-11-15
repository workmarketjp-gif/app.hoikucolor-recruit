import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isFreshApplicationOfferAcceptance,
  isFreshApplicationWithdrawal,
  applicationDecisionDisclosure,
} from '../src/lib/applicationDecisionDisclosure.ts';

const offered = Object.freeze({ id: 'application-A', status: 'offered', candidate_offer_response: null });

test('unchanged authorized offer is eligible for explicit acceptance', () => {
  assert.equal(isFreshApplicationOfferAcceptance(offered, { ...offered }), true);
  assert.equal(applicationDecisionDisclosure(offered.status, offered.candidate_offer_response)?.canAccept, true);
});

test('fails closed on another application or unavailable canonical read', () => {
  assert.equal(isFreshApplicationOfferAcceptance(offered, null), false);
  assert.equal(isFreshApplicationOfferAcceptance(null, offered), false);
  assert.equal(isFreshApplicationOfferAcceptance({ ...offered, id: '' }, offered), false);
  assert.equal(isFreshApplicationOfferAcceptance(offered, { ...offered, id: 'application-B' }), false);
});

test('facility decision changes invalidate old presented offer', () => {
  for (const status of ['reviewing', 'interview', 'hired', 'withdrawn', 'rejected', 'new', '']) {
    assert.equal(isFreshApplicationOfferAcceptance(offered, { ...offered, status }), false, status);
  }
});

test('canonical acceptance or other offer response prevents stale acceptance', () => {
  for (const response of ['accepted', 'declined', 'reschedule_requested']) {
    assert.equal(isFreshApplicationOfferAcceptance(offered, { ...offered, candidate_offer_response: response }), false, response);
  }
  assert.equal(isFreshApplicationOfferAcceptance({ ...offered, candidate_offer_response: 'accepted' },
    { ...offered, candidate_offer_response: 'accepted' }), false);
});

test('do not silently alter existing explicit withdrawal rules', () => {
  assert.equal(isFreshApplicationWithdrawal(offered, { ...offered }), true);
  assert.equal(isFreshApplicationWithdrawal(offered, { ...offered, status: 'withdrawn' }), false);
  assert.equal(applicationDecisionDisclosure('offered', 'accepted')?.accepted, true);
  assert.equal(applicationDecisionDisclosure('reviewing', null)?.canAccept, false);
});
