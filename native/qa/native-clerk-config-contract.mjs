import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/clerkConfig.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
async function run({ key = 'pk_live_Zml4dHVyZS5jbGVyay5hY2NvdW50cy5kZXYk', remote = key, failed = false, configured = true } = {}) {
  const exports = {}, events = [];
  vm.runInNewContext(compiled, { exports, require: () => ({ bootLog: e => events.push(e) }),
    process: { env: { EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: key,
      EXPO_PUBLIC_SUPABASE_URL: configured ? 'https://fixture.supabase.co' : '',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: configured ? 'fixture-public' : '' } },
    Error, AbortController, setTimeout, clearTimeout,
    fetch: async () => { if (failed) throw Error('fixture network'); return { ok: true, json: async () => ({ publishableKey: remote }) }; },
  });
  return { key: await exports.loadHoikuColorClerkPublishableKey(), events };
}
assert((await run()).events.includes('HC_CLERK_CONFIG_SOURCE_REMOTE'));
assert((await run({ failed: true })).events.includes('HC_CLERK_CONFIG_SOURCE_FALLBACK'));
assert((await run({ configured: false })).events.includes('HC_CLERK_CONFIG_SOURCE_FALLBACK'));
await assert.rejects(run({ remote: 'pk_test_differentinstance' }), /CLERK_CONFIG_INSTANCE_MISMATCH/);
await assert.rejects(run({ key: '', remote: 'not-a-key' }), /CLERK_CONFIG_INVALID/);
await assert.rejects(run({ key: '', configured: false }));
console.log('PASS Clerk config: canonical remote, fallback, no key, invalid response, instance mismatch fails closed');
