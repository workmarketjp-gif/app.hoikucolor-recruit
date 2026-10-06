import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/auth-custom.css', import.meta.url), 'utf8');
const checks = [
  ['login inputs are at least 16px (no iOS zoom)', css.includes('.hc-auth-page .hc-email-form input{font-size:16px;height:52px}')],
  ['login primary actions are at least 52px tall', css.includes('.hc-auth-page .hc-google-button,.hc-auth-page .hc-auth-primary{min-height:52px;font-size:16px}')],
];
for (const [name, ok] of checks) if (!ok) throw new Error(`HC_LOGIN_MOBILE_CONTRACT_FAILED: ${name}`);
console.log(`HC login mobile contract passed (${checks.length}/${checks.length})`);
