import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../src/app/application/[id].tsx', import.meta.url)), 'utf8');

test('application detail is valid TSX under the real project TypeScript parser', () => {
  const parsed = ts.createSourceFile('application/[id].tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(parsed.parseDiagnostics.length, 0, parsed.parseDiagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
});

test('private route guard mounts detail only for exact owner/session/application and unlocked foreground', () => {
  assert.match(source, /const ownerKey = candidateViewOwnerKey\(session\?\.user\?\.id, session\?\.id\)/);
  assert.match(source, /const privateAllowed = !!ownerKey && !privacy\.shieldVisible && privacy\.canAccessPrivateData\(\)/);
  assert.match(source, /candidateApplicationDetailKey\(ownerKey, params\.id, privateAllowed\)/);
  assert.match(source, /privateAllowed\s*\? <Text style=\{styles\.error\}>応募情報を確認できませんでした/);
  assert.match(source, /if \(!detailKey\)[\s\S]*?testID="application-private-shield"/);
  assert.match(source, /return <ApplicationDetailContent key=\{detailKey\} \/>/);
  assert.match(source, /usePrivateScreenCapture\('application-detail'\)/);
});

test('canonical detail refresh clears stale application, messages, documents and drafts on unmount', () => {
  const start = source.indexOf('  const load = useCallback(');
  const end = source.indexOf('\n  const latestLoad = useRef(load);', start);
  assert.ok(start > 0 && end > start);
  const body = source.slice(start, end);
  for (const fragment of ['setLoading(true);', 'setDetail(null);', 'setMessages([]);', 'setDocumentState(null);', 'setError(null);']) {
    assert.ok(body.includes(fragment), 'missing fail-closed refresh: ' + fragment);
  }
  assert.match(body, /!pinned\.isCurrent\(\) \|\| current !== generation\.current/);
  assert.match(source, /const latestLoad = useRef\(load\);/);
  assert.match(source, /latestLoad\.current = load;/);
  assert.match(source, /useFocusEffect\(useCallback\(\(\) => \{/);
  assert.match(source, /generation\.current \+= 1; \/\/ Never apply an in-flight read after blur/);
  assert.match(source, /setDetail\(null\);[\s\S]*setMessages\(\[\]\);[\s\S]*setDocumentState\(null\);/);
  assert.match(source, /const \[messageDraft, setMessageDraft\] = useState\(''\)/);
  assert.match(source, /const \[offerMessage, setOfferMessage\] = useState\(''\)/);
});
