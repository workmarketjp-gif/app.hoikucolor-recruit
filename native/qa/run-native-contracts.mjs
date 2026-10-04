#!/usr/bin/env node
// Runs every Native contract: the v77 inventory plus any other qa/*-contract.mjs.
// Missing inventory files are reported as UNMATERIALIZED, never silently skipped.
//   node qa/run-native-contracts.mjs                     strict: missing inventory fails
//   node qa/run-native-contracts.mjs --available-only    run what exists; still lists missing
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const nativeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qaDir = path.join(nativeRoot, 'qa');
const availableOnly = process.argv.includes('--available-only');

const inventory = JSON.parse(fs.readFileSync(path.join(qaDir, 'native-contract-inventory.json'), 'utf8')).contracts;
const extra = fs.readdirSync(qaDir).filter((file) => file.endsWith('-contract.mjs') && !inventory.includes(file)).sort();
const ordered = [...inventory, ...extra];

const passed = [];
const failed = [];
const missing = [];
for (const file of ordered) {
  if (!fs.existsSync(path.join(qaDir, file))) {
    missing.push(file);
    continue;
  }
  const result = spawnSync(process.execPath, [path.join('qa', file)], { cwd: nativeRoot, encoding: 'utf8' });
  if (result.status === 0) {
    passed.push(file);
    console.log(`PASS ${file}`);
  } else {
    failed.push(file);
    console.log(`FAIL ${file}`);
    process.stdout.write(`${result.stdout}${result.stderr}`.split(/\r?\n/).slice(-8).map((line) => `     ${line}`).join('\n') + '\n');
  }
}
for (const file of missing) console.log(`UNMATERIALIZED ${file}`);

console.log(`\nNative contracts: ${passed.length} PASS, ${failed.length} FAIL, ${missing.length} UNMATERIALIZED (of ${ordered.length}).`);
if (failed.length > 0) process.exit(1);
if (missing.length > 0 && !availableOnly) {
  console.log('Unmaterialized v77 contracts block the full contract gate. Use --available-only to run only materialized contracts.');
  process.exit(1);
}
