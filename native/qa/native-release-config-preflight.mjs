#!/usr/bin/env node
// Release config preflight CLI. Runs as `npm run release:preflight` and as the
// EAS `eas-build-pre-install` hook. Prints check codes only, never env values.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, validateReleaseConfig } from './release-config-preflight-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : undefined;
}

// Explicit --mode wins; inside EAS the build profile decides. Only the
// production profile is held to Store-release requirements.
const easProfile = process.env.EAS_BUILD_PROFILE;
const mode = argValue('--mode') ?? (easProfile === 'production' ? 'production' : 'development');
if (mode !== 'production' && mode !== 'development') {
  console.error(`RELEASE_PREFLIGHT_INVALID_MODE: ${mode}`);
  process.exit(2);
}

const envFile = argValue('--env-file');
const env = { ...loadEnvFile(envFile ? path.resolve(process.cwd(), envFile) : undefined), ...process.env };

const result = validateReleaseConfig({ rootDir, env, mode });
for (const warning of result.warnings) console.warn(`WARN ${warning}`);
if (!result.pass) {
  for (const error of result.errors) console.error(`FAIL ${error}`);
  console.error(`Native release config preflight (${mode}${easProfile ? `, EAS profile ${easProfile}` : ''}): ${result.errors.length} blocker(s).`);
  process.exit(1);
}
console.log(`Native release config preflight (${mode}${easProfile ? `, EAS profile ${easProfile}` : ''}): ${result.checks.filter((c) => !c.warning).length} checks PASS.`);
