/** Execute the actual TypeScript list verifier through the existing Node 22 contract runner. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const path = fileURLToPath(new URL('./native-candidate-application-readback.test.mjs', import.meta.url));
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', path], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
