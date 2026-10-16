import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalAnonymousLimiter, createLocalPublicMcpAudit } from '../anonymous-guard.mjs';

test('fixed window limiter denies excess and reopens only after window',async()=>{
  let now=0;
  const admit=createLocalAnonymousLimiter({limit:2,windowMs:1000,now:()=>now});
  assert.equal(await admit(),true);
  assert.equal(await admit(),true);
  assert.equal(await admit(),false);
  now=999;assert.equal(await admit(),false);
  now=1000;assert.equal(await admit(),true);
});
test('global limiter rejects clock rollback, no untrusted header-based bypass',async()=>{
  let now=1000;
  const admit=createLocalAnonymousLimiter({limit:1,windowMs:1000,now:()=>now});
  assert.equal(await admit(),true);
  assert.equal(await admit({forwardedFor:'changed'}),false);
  now=500;await assert.rejects(admit(),/MCP_RATE_LIMIT_CLOCK_ROLLBACK/);
});
test('limiter rejects invalid configuration',()=>{
  for(const args of [{limit:0},{limit:Infinity},{windowMs:999},{now:4}]){
    assert.throws(()=>createLocalAnonymousLimiter(args),/MCP_RATE_LIMIT_CONFIG_INVALID/);
  }
});
test('audit logs only small allowlisted event metadata',async()=>{
  const lines=[];
  const audit=createLocalPublicMcpAudit({write:(v)=>lines.push(v)});
  await audit({decision:'accepted',payload:'SENSITIVE_TOKEN',remoteIp:'203.0.113.5'});
  assert.equal(lines.length,1);
  assert.deepEqual(JSON.parse(lines[0]),{source:'hoiku-color-public-mcp',decision:'accepted'});
  await assert.rejects(audit({decision:'foo'}),/MCP_AUDIT_DECISION_INVALID/);
});
