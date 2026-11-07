import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const nativeRoot = fileURLToPath(new URL('..', import.meta.url));
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', 'qa/native-application-session-recovery.test.mjs'], {
  cwd: nativeRoot,
  encoding: 'utf8',
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error || result.status !== 0) process.exit(1);
