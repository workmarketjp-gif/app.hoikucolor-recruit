#!/usr/bin/env node
// Included automatically by qa/run-native-contracts.mjs when materialized.
// Runs the real TypeScript presentation module, not a copied test stub.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const nativeRoot = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.execPath, [
  '--experimental-strip-types', '--test', 'qa/native-saved-job-source-presentation.test.mjs',
], { cwd: nativeRoot, encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) throw result.error;
if (result.status !== 0) process.exit(1);
