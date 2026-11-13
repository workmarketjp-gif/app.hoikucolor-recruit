/** Materialized Native contract runner includes this file in test:contracts:available. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const nativeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawnSync(process.execPath, [
  '--experimental-strip-types',
  '--test',
  'qa/native-message-inbox-private-error-r223.test.mjs',
], { cwd: nativeRoot, stdio: 'inherit' });
if (child.error) throw child.error;
if (child.status !== 0) process.exit(child.status || 1);
