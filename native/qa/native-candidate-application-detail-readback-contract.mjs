/** Run the real source/TS Node tests with the available Native contract runner. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const path = fileURLToPath(new URL('./native-candidate-application-detail-readback.test.mjs', import.meta.url));
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', path], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
