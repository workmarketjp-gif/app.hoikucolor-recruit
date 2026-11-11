import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedScoutInbox, verifiedScoutPrivacy } from '../src/lib/scoutCanonicalReadback.ts';
const S='123e4567-e89b-42d3-a456-426614174000';
const O='123e4567-e89b-42d3-a456-426614174001';
const validScout={scout_id:S,organization_name:'合成法人',facility_name:'合成保育園',job_id:null,job_title:null,employment_type:null,invitation_message:'',scout_status:'pending',sent_at:'2026-11-01T00:00:00Z',expires_at:'2026-12-01T00:00:00Z',responded_at:null};
const validPrivacy={scout_opt_in:false,manual_blocks:[{organization_id:O,organization_name:'合成法人',source:'manual'}],automatic_blocks:[],identity_fields_shared_before_consent:false};
test('an authenticated zero-scout response is a real empty state',()=> assert.deepEqual(verifiedScoutInbox([]),[]));
test('a missing or malformed scout response is an error, not an empty inbox',()=>{
  for(const value of [null,undefined,{},'[]',[null],[{scout_id:S}]]) assert.throws(()=>verifiedScoutInbox(value),/スカウト一覧を確認/);
});
test('authenticated scout rows preserve status while rejecting ambiguous identity/state',()=>{
  const valid=[validScout];assert.equal(verifiedScoutInbox(valid),valid);
  for(const patch of [{scout_id:'invalid'},{scout_status:'unknown'},{organization_name:''},{job_id:'invalid'},{invitation_message:null}]) {
    assert.throws(()=>verifiedScoutInbox([{...validScout,...patch}]),/スカウト一覧を確認/);
  }
  assert.throws(()=>verifiedScoutInbox([validScout,{...validScout,scout_id:S.toUpperCase()}]),/スカウト一覧を確認/);
});
test('complete privacy settings including explicit opt-out preserve canonical values',()=>{
  assert.equal(verifiedScoutPrivacy(validPrivacy),validPrivacy);
  assert.deepEqual(verifiedScoutPrivacy({...validPrivacy,manual_blocks:[]}).manual_blocks,[]);
});
test('missing consent/block data cannot masquerade as the opted-out, unblocked defaults',()=>{
  for(const value of [null,{},[],{...validPrivacy,manual_blocks:null},{...validPrivacy,scout_opt_in:null},{...validPrivacy,identity_fields_shared_before_consent:null}]) {
    assert.throws(()=>verifiedScoutPrivacy(value),/スカウト公開設定を確認/);
  }
});
test('block records must remain valid and server-sourced; duplicates are ambiguous',()=>{
  for(const value of [
    {...validPrivacy,manual_blocks:[{organization_id:'bad',organization_name:'合成法人',source:'manual'}]},
    {...validPrivacy,manual_blocks:[{...validPrivacy.manual_blocks[0],source:'current_employer'}]},
    {...validPrivacy,manual_blocks:[validPrivacy.manual_blocks[0],validPrivacy.manual_blocks[0]]},
    {...validPrivacy,automatic_blocks:[{...validPrivacy.manual_blocks[0]}]},
  ]) assert.throws(()=>verifiedScoutPrivacy(value),/スカウト公開設定を確認/);
});
