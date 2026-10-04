import fs from 'node:fs';

const source = fs
  .readFileSync(new URL('../src/app/(tabs)/notifications.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

const checks = [
  ['notification center refreshes canonical state whenever the route gains focus', source.includes('useFocusEffect(') && source.includes('void refreshCanonical();')],
  ['focus refresh callback is memoized', source.includes("import { useCallback, useState } from 'react';") && source.includes('useCallback(() => {')],
  ['unknown unread count is not rendered as zero', !source.includes('unreadCount ?? 0') && source.includes("notifications.unreadCount == null ? '未読件数を確認できません'")],
  ['canonical refresh failures are surfaced in the same screen', source.includes('setRefreshError(true);') && source.includes('通知を更新できませんでした')],
  ['failed refresh has an in-place retry action', source.includes('同じ画面から再試行してください。') && source.includes('>再試行</Text>')],
  ['manual update uses the same guarded canonical refresh path', source.includes('onPress={() => void refreshCanonical()}')],
];

const failures = checks.filter(([, ok]) => !ok);
if (failures.length) {
  for (const [label] of failures) console.error(`FAIL: ${label}`);
  process.exit(1);
}
for (const [label] of checks) console.log(`PASS: ${label}`);
console.log(`Native notification focus refresh contract passed (${checks.length}/${checks.length}).`);
