import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplicationSecondaryRouteGate } from '../src/lib/applicationSecondaryRouteGate.ts';

const A = '["candidate-A","session-A"]';
const B = '["candidate-B","session-B"]';
const pinA = () => ({ownerId:'candidate-A', ownerSessionId:'session-A', isCurrent:()=>true});
const resolve = (user, session) => JSON.stringify([user, session]);
function deferred() {
  let resolvePromise;
  const promise = new Promise(resolve => {resolvePromise=resolve;});
  return {promise, resolve:resolvePromise};
}
function harness() {
  const gate = createApplicationSecondaryRouteGate();
  let owner=A, allowed=true, focused=true, openingRow=false, pushes=0, launches=0;
  const options = {
    expectedOwnerKey:A,
    currentOwnerKey:()=>owner,
    canNavigate:()=>allowed && focused && !openingRow,
    resolveOwnerKey:resolve,
    pin: async current => { launches++; assert.equal(current(),true);return pinA(); },
    navigate:()=>{pushes++;},
  };
  return {gate,options,get pushes(){return pushes;},get launches(){return launches;},
    setOwner:(s)=>owner=s,setAllowed:(s)=>allowed=s,setFocused:(s)=>focused=s,
    setOpeningRow:(s)=>openingRow=s};
}

test('verified same-candidate Clerk pin opens visits exactly once and holds the gate until blur', async () => {
  const h=harness();
  assert.equal(await h.gate.navigate(h.options),'opened');
  assert.equal(h.pushes,1);
  assert.equal(h.gate.isPending(),true);
  assert.equal(await h.gate.navigate(h.options),'blocked');
  assert.equal(h.launches,1);
  h.gate.invalidate();
  assert.equal(h.gate.isPending(),false);
});

test('two taps during a slow token pin never launch a second token request', async () => {
  const h=harness(), pending=deferred();
  h.options.pin = async ()=>pending.promise;
  const first=h.gate.navigate(h.options);
  assert.equal(h.gate.isPending(),true);
  assert.equal(await h.gate.navigate(h.options),'blocked');
  pending.resolve(pinA());
  assert.equal(await first,'opened');
  assert.equal(h.pushes,1);
});

test('account switch during pin prevents old candidate navigation', async () => {
  const h=harness(), pending=deferred();
  h.options.pin=async()=>pending.promise;
  const navigation=h.gate.navigate(h.options);
  h.setOwner(B);h.gate.invalidate();pending.resolve(pinA());
  assert.equal(await navigation,'blocked');
  assert.equal(h.pushes,0);
});

test('App Lock and blur discard late pins and allow next authorized visit only after fresh focus', async () => {
  const h=harness(), pending=deferred();
  h.options.pin=async()=>pending.promise;
  const navigation=h.gate.navigate(h.options);
  h.setAllowed(false);h.setFocused(false);h.gate.invalidate();pending.resolve(pinA());
  assert.equal(await navigation,'blocked');
  assert.equal(h.pushes,0);
  assert.equal(await h.gate.navigate(h.options),'blocked');
  h.setAllowed(true);h.setFocused(true);h.options.pin=async()=>pinA();
  assert.equal(await h.gate.navigate(h.options),'opened');
  assert.equal(h.pushes,1);
});

test('foreign, null, or revoked pin never navigates and permits explicit retry', async () => {
  const h=harness();
  for (const pin of [null,{ownerId:'candidate-B',ownerSessionId:'session-B',isCurrent:()=>true},
                      {ownerId:'candidate-A',ownerSessionId:'session-A',isCurrent:()=>false}]) {
    h.options.pin=async()=>pin;
    assert.equal(await h.gate.navigate(h.options),'failed');
    assert.equal(h.gate.isPending(),false);
  }
  assert.equal(h.pushes,0);
  h.options.pin=async()=>pinA();
  assert.equal(await h.gate.navigate(h.options),'opened');
});

test('router error releases the gate and a later deliberate tap can retry', async () => {
  const h=harness();let fail=true;
  h.options.navigate=()=>{if(fail)throw new Error('router');};
  assert.equal(await h.gate.navigate(h.options),'failed');
  assert.equal(h.gate.isPending(),false);
  fail=false;
  assert.equal(await h.gate.navigate(h.options),'opened');
});

test('row navigation pending, signout, and background deny a new secondary route', async () => {
  const h=harness();h.setOpeningRow(true);
  assert.equal(await h.gate.navigate(h.options),'blocked');
  h.setOpeningRow(false);h.setOwner(null);
  assert.equal(await h.gate.navigate(h.options),'blocked');
  h.setOwner(A);h.setFocused(false);
  assert.equal(await h.gate.navigate(h.options),'blocked');
  assert.equal(h.pushes,0);
  assert.equal(h.launches,0);
});

test('late failure from revoked A cannot unlock B navigation gate', async () => {
  const h=harness();const pendingA=deferred();
  h.options.pin=async()=>pendingA.promise;
  const first=h.gate.navigate(h.options);
  h.setOwner(B);h.gate.invalidate();
  const pendingB=deferred();
  const second=h.gate.navigate({...h.options,expectedOwnerKey:B,pin:async()=>pendingB.promise});
  assert.equal(h.gate.isPending(),true);
  pendingA.resolve(null);
  assert.equal(await first,'blocked');
  assert.equal(h.gate.isPending(),true);
  pendingB.resolve({ownerId:'candidate-B', ownerSessionId:'session-B',isCurrent:()=>true});
  assert.equal(await second,'opened');
  assert.equal(h.pushes,1);
});
