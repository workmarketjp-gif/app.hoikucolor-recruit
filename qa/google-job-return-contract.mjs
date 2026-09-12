import fs from 'node:fs';

const enhancer = fs.readFileSync('src/components/ExternalJobReturnEnhancer.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(enhancer.includes("url.origin !== window.location.origin"), 'return target must reject cross-origin URLs');
assert(enhancer.includes("url.pathname.replace(/\\/$/, '') !== '/jobs'"), 'return target must be restricted to the job-search route');
assert(enhancer.includes('jobIdPattern.test(jobId)'), 'job deep-links must require a UUID job_id');
assert(enhancer.includes("params.get('return_to')"), 'explicit login/signup return_to must be captured');
assert(enhancer.includes("sessionStorage.setItem(returnStorageKey"), 'safe job return must survive the authentication redirect');
assert(enhancer.includes("document.querySelector('.hc-auth-page')"), 'direct external job links must only be stored after the unauthenticated screen is confirmed');
assert(enhancer.includes("document.querySelector('.app-shell')"), 'stored job return must only be consumed after the signed-in app is present');
assert(enhancer.includes('window.location.replace(storedTarget)'), 'authentication completion must restore the validated job target');
assert(enhancer.includes("document.querySelectorAll<HTMLElement>('.job-card')"), 'job deep-link must resolve to an actual rendered job card');
assert(enhancer.includes('jobs.findIndex((job) => job.id === jobId)'), 'job deep-link must match by canonical job UUID');
assert(enhancer.includes("button.textContent?.includes('詳しく見る')"), 'target job detail must open automatically');
assert(enhancer.includes("scrollIntoView({ behavior: 'smooth', block: 'start' })"), 'target job must be brought into view');
assert(enhancer.includes('この求人は公開を終了したか'), 'expired or unpublished external job links must fail safely');
assert(main.includes("import { ExternalJobReturnEnhancer } from './components/ExternalJobReturnEnhancer'"), 'external job return enhancer must be mounted globally');
assert(main.includes('<ExternalJobReturnEnhancer />'), 'external job return enhancer must render alongside route roots');
assert(pkg.scripts['test:google-job-return'] === 'node qa/google-job-return-contract.mjs', 'google job return contract must be runnable');
assert(pkg.scripts.build.includes('test:google-job-return'), 'google job return contract must gate production builds');

console.log('google job return contract: ok');
