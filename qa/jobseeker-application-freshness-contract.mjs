import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const app = readFileSync(new URL('src/App.tsx', root), 'utf8');

for (const marker of [
  "import { useCallback, useEffect, useState } from 'react';",
  'const refreshApplications = useCallback(async (surfaceError = false) => {',
  'setApplications(await listApplications());',
  'const intervalId = window.setInterval(refreshWhenVisible, 60_000);',
  "window.addEventListener('focus', refreshWhenVisible);",
  "document.addEventListener('visibilitychange', refreshWhenVisible);",
  "window.addEventListener('hc:applications-refresh', refreshWhenVisible);",
  "window.removeEventListener('focus', refreshWhenVisible);",
  "document.removeEventListener('visibilitychange', refreshWhenVisible);",
  "window.removeEventListener('hc:applications-refresh', refreshWhenVisible);",
  "view !== 'applications' || selectedApplicationId",
  'void refreshApplications(true);',
]) {
  if (!app.includes(marker)) throw new Error(`Application freshness contract missing: ${marker}`);
}

if (!app.includes("if (document.visibilityState === 'visible') void refreshApplications(false);")) {
  throw new Error('Application refresh must avoid background polling while the page is hidden.');
}

console.log('Jobseeker application freshness contract passed.');
