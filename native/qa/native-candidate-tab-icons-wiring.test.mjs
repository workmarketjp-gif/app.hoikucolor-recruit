import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('five Web tabs bind to outlined Native icon names, not Unicode fallbacks', () => {
  const tabs = readFileSync(new URL('../src/app/(tabs)/_layout.tsx', import.meta.url), 'utf8');
  const icon = readFileSync(new URL('../src/components/CandidateTabIcon.tsx', import.meta.url), 'utf8');
  for (const [name, glyph] of [['home','home'],['jobs','search'],['career','yen'],['saved','heart'],['profile','user']]) {
    const screen = tabs.split('<Tabs.Screen name="' + name + '"')[1]?.split('/>')[0] ?? '';
    assert.ok(screen.includes("tabBarIcon: icon('" + glyph + "')"), name + ' is missing ' + glyph);
  }
  assert.match(tabs, /import \{ CandidateTabIcon \} from/);
  assert.match(icon, /candidateTabGlyphs\[name\]/);
  assert.doesNotMatch(tabs, /icon\(['"](?:♙|⌂|⌕|♡|¥)['"]\)/);
});
