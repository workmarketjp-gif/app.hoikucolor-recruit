import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual screen event handlers with an isolated Clerk/browser boundary.
const source = fs.readFileSync(new URL('../src/components/AuthScreen.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function harness(options = {}) {
  const states = []; let cursor = 0; const calls = [];
  const signIn = {
    status: 'needs_first_factor', supportedSecondFactors: [{ strategy: 'totp' }],
    create: async (args) => { calls.push(['create', args]); return { error: options.createError }; },
    emailCode: {
      sendCode: async () => { calls.push(['send']); if (options.sendReject) throw Error('offline'); return {}; },
      verifyCode: async () => { calls.push(['verify']); signIn.status = options.mfa ? 'needs_second_factor' : 'complete'; return { error: options.verifyError }; },
    },
    mfa: { verifyTOTP: async () => { calls.push(['mfa']); signIn.status = 'complete'; return {}; } },
    finalize: async () => { calls.push(['finalize']); if (options.finalizeReject) throw Error('finalize failed'); },
    reset: async () => { calls.push(['reset']); },
  };
  const signUp = { status: options.incompleteSignup ? 'missing_requirements' : 'complete', create: async (args) => { calls.push(['transfer', args]); return {}; }, finalize: async () => { calls.push(['signup-finalize']); } };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  const mocks = {
    '@clerk/expo': { useSignIn: () => ({ signIn }), useSignUp: () => ({ signUp }), useSSO: () => ({ startSSOFlow: async (args) => { calls.push(['google', args]); return options.google ?? { authSessionResult: { type: 'cancel' } }; } }) },
    'expo-router': { useRouter: () => ({ replace: (path) => calls.push(['route', path]) }) },
    'expo-auth-session': { makeRedirectUri: ({ scheme, path }) => `${scheme}://${path}` },
    'expo-web-browser': { maybeCompleteAuthSession() {} },
    react: { useState: (initial) => { const i=cursor++; if (!(i in states)) states[i]=initial; return [states[i], (value) => { states[i]=value; }]; }, useRef: (initial) => { const i=cursor++; return states[i] ??= {current:initial}; } },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { StyleSheet: { create: x=>x }, useWindowDimensions: () => ({width:390,height:844}), Platform: { OS: 'ios' }, ...Object.fromEntries(['ActivityIndicator','Image','KeyboardAvoidingView','Pressable','ScrollView','Text','TextInput','View'].map(x=>[x,x])) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  };
  vm.runInNewContext(compiled, { exports, require: name => mocks[name] ?? name });
  let tree;
  const render = () => { cursor=0; tree=exports.AuthScreen({isSignup:options.signup}); };
  const all = (node) => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(all)];
  const find = id => all(tree).find(n=>n.props?.testID===id);
  const click = async id => { find(id).props.onPress(); await new Promise(resolve=>setImmediate(resolve)); render(); };
  render();
  return { calls, click, find, render, states, text: () => JSON.stringify(tree) };
}
const enter = async h => { h.find(h.find('sign-up-email') ? 'sign-up-email' : 'sign-in-email').props.onChangeText(' person@example.jp '); h.render(); await h.click('auth-submit'); };
const verify = async h => { h.find('auth-code').props.onChangeText('123456'); h.render(); await h.click('auth-submit'); };
{
  const h=harness(); await enter(h); assert.equal(JSON.stringify(h.calls[0]),JSON.stringify(['create',{identifier:'person@example.jp',signUpIfMissing:true}])); await verify(h); assert(h.calls.some(x=>x[0]==='finalize')); assert(h.calls.some(x=>x[0]==='route'));
}
{
  const h=harness({signup:true,verifyError:{errors:[{code:'sign_up_if_missing_transfer'}]}}); await enter(h); await verify(h); assert(h.calls.some(x=>x[0]==='transfer')); assert(h.calls.some(x=>x[0]==='signup-finalize')); assert(!h.calls.some(x=>x[0]==='finalize'));
}
for (const options of [{createError:{message:'invalid'}},{sendReject:true}]) {
  const h=harness(options); await enter(h); assert(!h.find('auth-code')); assert(h.text().includes(options.sendReject?'offline':'invalid')); assert.equal(h.find('auth-submit').props.disabled,false);
}
{
  const h=harness({verifyError:{message:'wrong code'}}); await enter(h); await verify(h); assert(!h.calls.some(x=>x[0]==='route')); assert(h.text().includes('wrong code'));
}
{
  const h=harness({incompleteSignup:true,verifyError:{code:'sign_up_if_missing_transfer'}}); await enter(h); await verify(h); assert(!h.calls.some(x=>x[0]==='route' || x[0]==='signup-finalize'));
}
{
  const h=harness({mfa:true}); await enter(h); await verify(h); assert(!h.calls.some(x=>x[0]==='route')); await verify(h); assert(h.calls.some(x=>x[0]==='mfa')); assert(h.calls.some(x=>x[0]==='route'));
}
{
  const h=harness(); await h.click('auth-google'); assert(!h.calls.some(x=>x[0]==='route')); assert.equal(h.calls[0][1].redirectUrl,'hoikucolor://sso-callback'); assert.equal(h.find('auth-submit').props.disabled,false);
}
{
  const h=harness(); h.find('sign-in-email').props.onChangeText('person@example.jp'); h.render(); h.find('auth-submit').props.onPress(); h.find('auth-submit').props.onPress(); await new Promise(resolve=>setImmediate(resolve)); assert.equal(h.calls.filter(x=>x[0]==='create').length,1);
}

{
  const h=harness(); await enter(h); await h.click('auth-resend'); assert.equal(h.calls.filter(x=>x[0]==='send').length,2); await h.click('auth-change-email'); assert(h.find('sign-in-email')); assert(!h.find('auth-code')); assert(h.calls.some(x=>x[0]==='reset'));
}
{
  let activated = false;
  const h=harness({google:{createdSessionId:'test-session',setActive:async ({session})=>{assert.equal(session,'test-session'); activated=true;}}}); await h.click('auth-google'); assert(activated); assert(h.calls.some(x=>x[0]==='route'));
}
{
  const h=harness({finalizeReject:true}); await enter(h); await verify(h); assert(!h.calls.some(x=>x[0]==='route')); assert(h.text().includes('finalize failed'));
}
console.log('PASS Native auth event handlers: existing/new accounts, errors, MFA, cancel, duplicate submission');
