import { readFileSync } from 'node:fs';

// Regression contract for the 2026-10-16 production failure:
//   POST /storage/v1/object/hc-application-documents/jobseekers/... -> 400
//   "Invalid key: jobseekers/<sub>/<uuid>/履歴書(…)_MACP様.pdf"
// Supabase Storage validates object keys against an ASCII-only pattern, so the
// candidate's original file name must never be part of the key.

const root = new URL('../', import.meta.url);
const web = readFileSync(new URL('src/lib/documentVaultRepository.ts', root), 'utf8');
const native = readFileSync(new URL('native/src/lib/documentVaultApi.ts', root), 'utf8');
const panel = readFileSync(new URL('src/components/DocumentVaultPanel.tsx', root), 'utf8');

// Mirrors supabase/storage `isValidKey` (src/storage/limits.ts).
const SUPABASE_VALID_KEY = /^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/;

const failures = [];
const check = (label, ok) => { if (!ok) failures.push(label); };

const owner = 'user_3KGZJefUP8b9MJ2YgrsOEh1z1cD';
const id = '65319599-f58c-4664-80d4-4ad5694de698';
const legacyKey = `jobseekers/${owner}/${id}/履歴書(島貫征之)_MACP様.pdf`;
check('root cause reproduces: Japanese file name is an invalid Storage key', !SUPABASE_VALID_KEY.test(legacyKey));

for (const ext of ['pdf', 'jpg', 'png']) {
  const key = `jobseekers/${owner}/${id}/document.${ext}`;
  check(`generated key is valid for Supabase Storage (${ext})`, SUPABASE_VALID_KEY.test(key));
  check(`generated key keeps the 4-segment canonical shape (${ext})`, key.split('/').length === 4);
  check(`attachment destination is valid (${ext})`, SUPABASE_VALID_KEY.test(
    `00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/00000000-0000-0000-0000-000000000003/vault-${id}/document.${ext}`,
  ));
}

for (const [name, source] of [['web', web], ['native', native]]) {
  check(`${name}: user file names are no longer sanitised into keys`, !source.includes('safeFileName('));
  check(`${name}: key file name derives from the validated MIME type`, /const fileName = storageFileNameForMime\(mimeType\);/.test(source));
  check(`${name}: canonical source path unchanged`, source.includes('`jobseekers/${ownerId}/${id}/${fileName}`'));
  check(`${name}: pdf/jpeg/png extension map`, source.includes("'application/pdf': 'pdf'") && source.includes("'image/jpeg': 'jpg'") && source.includes("'image/png': 'png'"));
  check(`${name}: attachment reuses the source key segment verbatim`, /const fileName = pathParts\[pathParts\.length - 1\] \?\? '';/.test(source));
  check(`${name}: attachment rejects non storage-safe legacy segments`, source.includes('STORAGE_KEY_SEGMENT.test(fileName)'));
}

check('web: file signature is checked before upload', web.includes('bytesMatchMime(header, mimeType)'));
check('web: upload sends the validated MIME type', web.includes('contentType: mimeType'));
check('web: original file name kept for display in title', web.includes("file.name.normalize('NFC')"));

check('panel: raw Storage errors are translated', panel.includes('describeDocumentError(') && !panel.includes('err.message'));
check('panel: failed upload can be retried without reselecting', panel.includes('同じファイルでもう一度保存する'));
check('panel: progress/success announced to assistive tech', panel.includes('aria-live="polite"'));
check('panel: error announced to assistive tech', panel.includes('role="alert"'));

if (failures.length) {
  console.error(`Document storage key contract failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Document storage key contract passed.');
