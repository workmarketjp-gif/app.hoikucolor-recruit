#!/usr/bin/env node
// Auto-discovered by run-native-contracts.mjs in a full Native checkout.
// Dedicated Node real-source tests; no mock Expo runtime or screen render claim.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const nativeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, [
  '--experimental-strip-types',
  '--test',
  'qa/native-application-selection-timeline.test.mjs',
  'qa/native-application-selection-timeline-wiring.test.mjs',
], { cwd: nativeRoot, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
