import fs from 'node:fs';

// Web source baseline: /profile -> 応募書類; main 8c502fdb3a1697eb9eedf1f7b02de30374cb7b5c.
// Its "差し替え" uploads a new source with makeDefault=true, retains the old source,
// and does not mutate submitted application copies. Source checked 2026-11-19 NZ.
const read = (p) => fs.readFileSync(p, 'utf8');
const vault = read('src/components/DocumentVaultSection.tsx');
const api = read('src/lib/documentVaultApi.ts');
const proof = read('src/lib/confirmCandidateVaultReplacement.ts');
const start = vault.indexOf('    if (replacement) {');
const end = vault.indexOf('    // Confirm the uploaded file through candidate-scoped canonical records.', start);
const replacement = start >= 0 && end > start ? vault.slice(start, end) : '';
const checks = [];
const check = (name, condition) => checks.push([name, Boolean(condition)]);

check('file and camera replacement CTAs exist', vault.includes('document-vault-replace-file-') && vault.includes('document-vault-replace-camera-'));
check('replacement offered only for a selected default (Web parity)', vault.includes('{document.is_default ? <>'));
check('replacement preserves document type', vault.includes('replacement?.document_type ?? documentType'));
check('candidate owner and pinned session', vault.includes('replacement.jobseeker_clerk_user_id !== pickerOwnerId') && vault.includes('pinCandidateAction()'));
check('canonical uploader and RPC', vault.includes('uploadPickedJobseekerDocument') && api.includes("client.rpc('hc_register_jobseeker_document_source'"));
check('replacement selects new default like Web', vault.includes('makeDefault: Boolean(replacement) || !sameTypeExists,') && api.includes('if (options.makeDefault)'));
check('canonical read before success', replacement.includes('const canonical = await listJobseekerDocuments(pinned.client)') && replacement.includes('confirmCandidateVaultReplacementPreserved({'));
check('old vault source not deleted or re-defaulted implicitly', !replacement.includes('deleteJobseekerDocument(') && !replacement.includes('setDefaultJobseekerDocument('));
check('old source remains and becomes non-default', proof.includes('oldRow.is_default !== false') && proof.includes('newRow.is_default !== true'));
check('owner and path integrity', proof.includes('assertCandidateDocumentListOwner(canonicalRows, ownerId)') && proof.includes('oldRow.file_path !== previous.file_path'));
check('session privacy checks after readback', replacement.includes('replacementStillCurrent') && replacement.includes('privacy.canAccessPrivateData()'));
check('Web-aligned retained-source notice', replacement.includes('以前の書類は書類庫に残っています'));
check('submitted application copy is not mutated', !replacement.includes('application_document'));
check('camera recovery preserved', vault.includes('requestCameraPermissionsAsync') && vault.includes('permission.canAskAgain === false') && vault.includes('Linking.openSettings()'));
check('unique storage object and no upsert', api.includes('Crypto.randomUUID()') && api.includes('upsert: false'));
check('temporary cache still quarantine tracked', vault.includes('registerPendingDocumentPickerCache') && vault.includes('consumePendingDocumentPickerCache'));

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error('Native CA-04 Web replacement contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}
console.log(`Native CA-04 Web replacement contract PASS (${checks.length}/${checks.length})`);
