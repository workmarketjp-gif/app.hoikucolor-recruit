/** Existing contract runner starts .mjs without flags. Use the tested Node 22 TS loader. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testFile = fileURLToPath(new URL('./native-message-read-visibility.test.mjs', import.meta.url));
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', testFile], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
