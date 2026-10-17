import assert from 'node:assert/strict';
import test from 'node:test';
import { createColorMcpGateway, registerPublicCatalogTools } from '../sdk-bridge.mjs';

const time = Date.parse('2026-10-16T03:00:00Z');
const uid = '11111111-1111-4111-8111-000000000001';
const validRow = { id: uid, title: '保育士募集', is_external: false, published_at: '2026-10-10T00:00:00Z',
  closing_at: '2026-10-31T00:00:00Z', prefecture: '東京都', candidate_email: 'PRIVATE@EXAMPLE.COM' };
const config = (rows = [validRow],status=200) => ({
  supabaseUrl: 'https://kcmmpjyngcysdfbumchk.supabase.co', publishableKey: 'sb_publishable_test', now: () => time,
  fetcher: async () => ({ok:status===200,status,headers:{get:()=>null},json:async()=>rows}),
});

function fakeZ() {
  const chain=()=>({max(){return this},min(){return this},int(){return this},optional(){return this},strict(){return this},uuid(){return this},nullable(){return this},finite(){return this},nonnegative(){return this},url(){return this}});
  return {string:chain,number:chain,boolean:chain,array:chain,object:()=>chain()};
}
function registrars(rows,status) {
  const seen=[];
  const server={registerTool:(name,meta,run)=>seen.push({name,meta,run})};
  registerPublicCatalogTools(server, fakeZ(), config(rows,status));
  return seen;
}
const security={allowedHosts:['mcp.hoikucolor.jp','127.0.0.1:3107'],allowedOrigins:['https://hoikucolor.jp'],allowLocalHttp:true,admit:async()=>true,audit:async()=>{}};
function gateway() {
  let sent=0,created=0;const handler={fetch:async()=>{sent++;return new Response('ok')},close:()=>{}};
  const g=createColorMcpGateway({McpServer:class{registerTool(){}},createMcpHandler:(factory,options)=>{created++;assert.equal(options.legacy,'stateless');assert.equal(options.responseMode,'json');assert.equal(options.maxRequestBodySize,65536);factory();return handler;},z:fakeZ()},config(),security);
  return {g,counts:()=>({sent,created})};
}
function request(url='https://mcp.hoikucolor.jp/mcp', opts={}) {
  return new Request(url,{method:opts.method||'POST',headers:{'content-type':'application/json',...(opts.headers||{})},body:opts.method==='GET'||opts.method==='DELETE'?undefined:'{}'});
}

test('only three public read-only tools are registered',()=>{
  const tools=registrars();assert.deepEqual(tools.map(t=>t.name),['search_public_childcare_jobs','list_public_childcare_job_filters','get_public_childcare_job']);
  for(const t of tools){assert.equal(t.meta.annotations.readOnlyHint,true);assert.equal(t.meta.annotations.destructiveHint,false);}
});
test('registered search returns structured public-only data',async()=>{
  const result=await registrars()[0].run({limit:10,offset:0});
  assert.equal(result.structuredContent.jobs.length,1);
  assert.equal(result.structuredContent.jobs[0].id,uid);
  assert.equal(JSON.stringify(result).includes('PRIVATE@EXAMPLE.COM'),false);
});
test('registered detail uses the same safe projection',async()=>{
  const result=await registrars()[2].run({job_id:uid});
  assert.equal(result.structuredContent.job.id,uid);
  assert.equal(JSON.stringify(result).includes('PRIVATE@EXAMPLE.COM'),false);
});
test('upstream service errors sanitized without leaking URL or secret',async()=>{
  const result=await registrars([],503)[0].run({});
  assert.equal(result.isError,true);assert.equal(JSON.stringify(result).includes('503'),false);
  assert.equal(JSON.stringify(result).includes('sb_publishable_'),false);
});
test('invalid model-supplied args cannot change backend URL or admin keys',async()=>{
  const result=await registrars()[0].run({supabaseUrl:'http://attacker.test'});
  assert.equal(result.isError,true);
});
test('only explicitly approved HTTPS MCP host and allowed Origin proceed',async()=>{
  const {g,counts}=gateway();
  const ok=await g.fetch(request('https://mcp.hoikucolor.jp/mcp',{headers:{origin:'https://hoikucolor.jp'}}));
  assert.equal(ok.status,200);assert.equal(counts().sent,1);
  assert.equal((await g.fetch(request('https://mcp.hoikucolor.jp/mcp',{headers:{origin:'https://attacker.example'}}))).status,403);
  assert.equal((await g.fetch(request('https://attacker.test/mcp'))).status,403);
  assert.equal(counts().sent,1);
});
test('deny injected authorization/cookie until private OAuth phase',async()=>{
  const {g,counts}=gateway();
  assert.equal((await g.fetch(request(undefined,{headers:{authorization:'Bearer fake'}}))).status,403);
  assert.equal((await g.fetch(request(undefined,{headers:{cookie:'sid=fake'}}))).status,403);
  assert.equal(counts().sent,0);
});
test('GET/DELETE and non-MCP paths are not an alternate data channel',async()=>{
  const {g,counts}=gateway();
  assert.equal((await g.fetch(request('https://mcp.hoikucolor.jp/admin'))).status,404);
  assert.equal((await g.fetch(request(undefined,{method:'GET'}))).status,405);
  assert.equal((await g.fetch(request(undefined,{method:'DELETE'}))).status,405);
  assert.equal(counts().sent,0);
});
test('reject non-JSON and oversized request before SDK handler',async()=>{
  const {g,counts}=gateway();
  assert.equal((await g.fetch(request(undefined,{headers:{'content-type':'text/plain'}}))).status,415);
  assert.equal((await g.fetch(request(undefined,{headers:{'content-length':'100000'}}))).status,413);
  assert.equal(counts().sent,0);
});
test('fail closed on HTTP except local explicit opt-in',async()=>{
  const {g,counts}=gateway();
  assert.equal((await g.fetch(request('http://127.0.0.1:3107/mcp'))).status,200);
  assert.equal((await g.fetch(request('http://mcp.hoikucolor.jp/mcp'))).status,403);
  assert.equal(counts().sent,1);
});
test('no wildcard host and invalid origin config',()=>{
  assert.throws(()=>createColorMcpGateway({McpServer:class{},createMcpHandler:()=>{},z:fakeZ()},config(),{allowedHosts:['*']}),/MCP_ALLOWED_HOSTS_REQUIRED/);
  assert.throws(()=>createColorMcpGateway({McpServer:class{},createMcpHandler:()=>{},z:fakeZ()},config(),{allowedHosts:['localhost'],allowedOrigins:['*']}),/MCP_ALLOWED_ORIGINS_INVALID/);
});

test('registered facets tool accepts only no-input public catalog reads', async () => {
  const rows=[{prefectures:['東京都'],employment_types:['full_time']}];
  const result=await registrars(rows)[1].run({});
  assert.deepEqual(result.structuredContent.prefectures,['東京都']);
  assert.deepEqual(result.structuredContent.employment_types,['full_time']);
  const denied=await registrars(rows)[1].run({access_token:'forbidden'});
  assert.equal(denied.isError,true);
});

test('reject remote deployment configuration without admission or audit policy',()=>{
  const sdk={McpServer:class{registerTool(){}},createMcpHandler:()=>({fetch:async()=>new Response('ok')}) ,z:fakeZ()};
  assert.throws(()=>createColorMcpGateway(sdk,config(),{allowedHosts:['mcp.hoikucolor.jp'],allowedOrigins:[]}),/MCP_REMOTE_CONTROLS_REQUIRED/);
  assert.throws(()=>createColorMcpGateway(sdk,config(),{allowedHosts:['mcp.hoikucolor.jp'],allowedOrigins:[],admit:async()=>true}),/MCP_REMOTE_CONTROLS_REQUIRED/);
});

test('rate limiting responds 429 without passing tool request to MCP SDK',async()=>{
  let sdkCalls=0;
  const gate={...security,admit:async()=>false,audit:async()=>{}};
  const sdk={McpServer:class{registerTool(){}},createMcpHandler:()=>({fetch:async()=>{sdkCalls++;throw Error('MUST_NOT_EXECUTE')}}),z:fakeZ()};
  const guarded=createColorMcpGateway(sdk,config(),gate);
  const response=await guarded.fetch(request());
  assert.equal(response.status,429);
  assert.equal(response.headers.get('retry-after'),'60');
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(sdkCalls,0);
});

test('audit and rate-limit failures fail closed without leaking error details',async()=>{
  for (const key of ['admit','audit']) {
    const bad={...security,[key]:async()=>{throw Error('INTERNAL_SECRET_SHOULD_NOT_LEAK')}};
    const g=createColorMcpGateway({McpServer:class{registerTool(){}},createMcpHandler:()=>({fetch:async()=>new Response('should_not_reach_sdk')}) ,z:fakeZ()},config(),bad);
    const response=await g.fetch(request());
    assert.equal(response.status,503);
    assert.equal((await response.text()).includes('SECRET'),false);
  }
});

test('audit metadata excludes bearer token, untrusted prompts, and IP headers',async()=>{
  const audits=[]; let admitted=0;
  const policy={...security,admit:async(signal)=>{admitted++;assert.equal(signal instanceof AbortSignal,true);return true;},audit:async(info,signal)=>{assert.equal(signal instanceof AbortSignal,true);audits.push(info)}};
  const g=createColorMcpGateway({McpServer:class{registerTool(){}},createMcpHandler:()=>({fetch:async()=>new Response('ok')}),z:fakeZ()},config(),policy);
  const res=await g.fetch(request(undefined,{headers:{'x-forwarded-for':'192.0.2.123','cf-connecting-ip':'192.0.2.23'}}));
  assert.equal(res.status,200);
  assert.equal(admitted,1);
  assert.deepEqual(audits,[{decision:'accepted'}]);
});

test('bad origins are rejected before rate limiter and audit',async()=>{
  let calls=0;
  const policy={...security,admit:async()=>{calls++;return true;},audit:async()=>{calls++;}};
  const g=createColorMcpGateway({McpServer:class{registerTool(){}},createMcpHandler:()=>({fetch:async()=>new Response('ok')}),z:fakeZ()},config(),policy);
  assert.equal((await g.fetch(request(undefined,{headers:{origin:'https://evil.example'}}))).status,403);
  assert.equal(calls,0);
});

test('each public catalog tool explicitly advertises noauth without OAuth scopes', () => {
  const tools = registrars();
  assert.equal(tools.length, 3);
  for (const { meta } of tools) {
    assert.deepEqual(meta.securitySchemes, [{ type: 'noauth' }]);
    assert.equal(JSON.stringify(meta).includes('oauth2'), false);
    assert.equal(meta.annotations.readOnlyHint, true);
  }
});
