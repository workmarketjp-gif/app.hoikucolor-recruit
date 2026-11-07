import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('./native-job-detail-favorite-behavior.test.mjs', import.meta.url));
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', target], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
