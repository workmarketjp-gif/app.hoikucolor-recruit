import assert from 'node:assert/strict';
import test from 'node:test';
import { searchPublicChildcareJobs } from '../public-jobs.mjs';

const now = Date.parse('2026-10-24T02:00:00Z');
function row(n, fresh) {
  return {
    id: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`,
    title: '公開保育求人', prefecture: '東京都', is_external: true,
    published_at: '2026-10-01T00:00:00Z', closing_at: null,
    source_last_verified_at: fresh ? '2026-10-24T01:00:00Z' : '2026-10-22T00:00:00Z',
    internal_notes: 'PRIVATE-NOTES', candidate_email: 'PRIVATE@example.com',
  };
}
function source(jobs) {
  const calls = [];
  return {
    calls,
    supabaseUrl: 'https://public-test.supabase.co',
    publishableKey: 'sb_publishable_test',
    now: () => now,
    fetcher: async (url, init) => {
      assert.equal(new URL(url).pathname, '/rest/v1/rpc/hc_public_search_jobs_v2');
      assert.equal(init.method, 'POST');
      assert.equal(init.headers.apikey, 'sb_publishable_test');
      assert.equal(init.headers.Authorization, undefined);
      const params = JSON.parse(init.body);
      assert.equal(params.p_ho_verified, false);
      calls.push({offset:params.p_offset,limit:params.p_limit});
      return Response.json(jobs.slice(params.p_offset, params.p_offset + params.p_limit)
        .map(j => ({...j,total_count:jobs.length})));
    },
  };
}

test('real public RPC adapter scans past stale rows but never outputs private columns', async () => {
  const data=[row(1,false),row(2,false),row(3,true),row(4,true)];
  const config=source(data);
  const result=await searchPublicChildcareJobs({limit:2,offset:0},config);
  assert.deepEqual(result.jobs.map(x=>x.id),[data[2].id,data[3].id]);
  assert.equal(result.returned,2);
  assert.equal(result.reported_total,4);
  assert.equal(result.scanned_source_rows,4);
  assert.deepEqual(config.calls,[{offset:0,limit:2},{offset:2,limit:2}]);
  assert.equal(result.next_offset,4);
  assert.equal(result.possible_more_source_rows,true);
  assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
  // Exact totals may be stale. The next genuinely empty public RPC page is
  // what proves exhaustion, without echoing excluded or private columns.
  const end=await searchPublicChildcareJobs({limit:2,offset:result.next_offset},config);
  assert.equal(end.returned,0);
  assert.equal(end.next_offset,null);
  assert.equal(JSON.stringify(end).includes('PRIVATE'),false);
});

test('visible continuation reuses upstream cursor and never repeats filtered jobs', async () => {
  const data=[row(1,false),row(2,true),row(3,true),row(4,false),row(5,true),row(6,true),row(7,true)];
  const config=source(data);
  const first=await searchPublicChildcareJobs({limit:2,offset:0},config);
  assert.equal(first.next_offset,3);
  const second=await searchPublicChildcareJobs({limit:2,offset:first.next_offset},config);
  assert.deepEqual(first.jobs.map(x=>x.id),[data[1].id,data[2].id]);
  assert.deepEqual(second.jobs.map(x=>x.id),[data[4].id,data[5].id]);
  assert.equal(second.next_offset,6);
});

test('zero visible result with additional upstream rows gives a truthful continuation',async()=>{
  const config=source(Array.from({length:50},(_,i)=>row(i+1,false)));
  const result=await searchPublicChildcareJobs({limit:2},config);
  assert.equal(result.returned,0);
  assert.equal(result.reported_total,50);
  assert.equal(result.next_offset,8);
  assert.equal(result.possible_more_source_rows,true);
  assert.match(result.note,/next_offset/);
  assert.equal(config.calls.length,4);
});
