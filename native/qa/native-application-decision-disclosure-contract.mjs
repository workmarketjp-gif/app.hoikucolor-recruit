#!/usr/bin/env node
// Auto-discovered in full checkout; tests real source, not a Native simulator.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, [
  '--experimental-strip-types', '--test',
  'qa/native-application-decision-disclosure.test.mjs',
  'qa/native-application-decision-disclosure-wiring.test.mjs',
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
