import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const screen = readFileSync(new URL('../src/app/visits.tsx', import.meta.url),'utf8');

test('both visit writes pin, invoke and quarantine through bounded presentation',()=>{
  const req = screen.split('  const requestVisit = async () => {')[1]?.split('  const cancel = async')[0];
  const cancel = screen.split('  const cancel = async (reservationId: string) => {')[1]?.split('  const openRelatedVisitTarget = async')[0];
  assert.ok(req && cancel);
  for (const section of [req,cancel]) {
    assert.match(section,/boundedVisitMutationPresentation\(pinCandidateAction, quarantineOnDeadline\)/);
    assert.match(section,/mutationGate\.current\.quarantine\(ticket\)/);
    assert.match(section,/instanceof VisitMutationPresentationDeadlineError/);
    assert.match(section,/setBusy\(false\)/);
  }
  assert.match(req,/boundedVisitMutationPresentation\(\(\) => requestVisitDurable\(/);
  assert.match(cancel,/boundedVisitMutationPresentation\(\(\) => cancelVisit\(/);
  assert.match(screen,/!mutationGate\.current\.isPending\(\)/);
  assert.match(screen,/mutationGate\.current\.isQuarantined\(\) && privateAllowed/);
});
