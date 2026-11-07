/** The existing Native contract runner does not set Node 22's TS strip-types flag. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testFile = fileURLToPath(new URL('./native-attention-rpc-integrity.test.mjs', import.meta.url));
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', testFile], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
