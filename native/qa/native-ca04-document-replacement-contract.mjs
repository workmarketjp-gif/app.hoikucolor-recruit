import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const vault = read('src/components/DocumentVaultSection.tsx');
const api = read('src/lib/documentVaultApi.ts');

const checks = [];
const check = (name, condition) => checks.push([name, Boolean(condition)]);

check('file replacement CTA exists', vault.includes('document-vault-replace-file-') && vault.includes('ファイルで差し替え'));
check('camera replacement CTA exists', vault.includes('document-vault-replace-camera-') && vault.includes('撮影して差し替え'));
check('replacement snapshots original document type', vault.includes('replacement?.document_type ?? documentType'));
check('replacement remains candidate scoped', vault.includes('replacement.jobseeker_clerk_user_id !== pickerOwnerId') && vault.includes('pinCandidateAction()'));
check('new source uses canonical uploader', vault.includes('uploadPickedJobseekerDocument') && api.includes("client.rpc('hc_register_jobseeker_document_source'"));
check('old default remains authoritative during upload', vault.includes('makeDefault: !replacement && !sameTypeExists'));
check('new source is canonically re-read before old delete', vault.indexOf('canonical = await listJobseekerDocuments(pinned.client)') < vault.indexOf('await deleteJobseekerDocument(pinned.client, canonicalOld)'));
check('default switch is recovered by canonical re-read', vault.includes('await setDefaultJobseekerDocument(pinned.client, canonicalSaved.id)') && vault.includes('if (!canonicalSaved?.is_default) throw error'));
check('old source deletion happens only after new source validation', vault.includes("throw new Error('新しい書類の保存結果を確認できませんでした。古い書類は変更していません。')") && vault.includes('if (canonicalOld)'));
check('ambiguous old delete is reconciled instead of blindly retried', vault.includes('Deletion can also finish server-side before a network response is') && vault.includes('canonicalOld = canonical.find((item) => item.id === replacement.id) ?? null'));
check('partial cleanup is not reported as success', vault.includes('新しい書類は保存済みです') && vault.includes('古い書類の削除だけ完了できませんでした'));
check('replacement completion requires old source absence', vault.includes('if (canonicalOld)') && vault.includes("Alert.alert('差し替えました'"));
check('submitted application copies remain immutable', vault.includes('提出済みの応募書類コピーは変更されません'));
check('camera replacement reuses permission denial handling', vault.includes('requestCameraPermissionsAsync') && vault.includes('permission.canAskAgain === false') && vault.includes('Linking.openSettings()'));
check('replacement does not overwrite storage object in place', api.includes('Crypto.randomUUID()') && api.includes('upsert: false'));
check('temporary picked files remain quarantine tracked', vault.includes('registerPendingDocumentPickerCache') && vault.includes('consumePendingDocumentPickerCache'));

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error('Native CA-04 document replacement contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}
console.log(`Native CA-04 document replacement contract PASS (${checks.length}/${checks.length})`);
