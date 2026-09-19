import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const pkg = JSON.parse(read('package.json'));
const app = JSON.parse(read('app.json'));
const vault = read('src/components/DocumentVaultSection.tsx');
const api = read('src/lib/documentVaultApi.ts');
const recovery = read('src/lib/cameraCaptureRecovery.ts');
const boundary = read('src/contexts/DocumentPickerCacheBoundary.tsx');
const preflight = read('qa/release-config-preflight-lib.mjs');
const stub = read('qa/stubs.d.ts');
const qa = read('QA_CAMERA_DOCUMENT_CAPTURE_P0.md');

const checks = [];
const check = (name, condition) => checks.push([name, Boolean(condition)]);
check('SDK55 image-picker dependency prepared', pkg.dependencies?.['expo-image-picker'] === '~55.0.24');
const plugin = app.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-image-picker');
check('camera plugin configured', Boolean(plugin));
check('camera permission has purpose string', typeof plugin?.[1]?.cameraPermission === 'string' && plugin[1].cameraPermission.includes('応募書類'));
check('microphone permission disabled', plugin?.[1]?.microphonePermission === false);
check('direct camera CTA exists', vault.includes('document-vault-camera') && vault.includes('launchCameraAsync'));
check('camera permission requested explicitly', vault.includes('requestCameraPermissionsAsync'));
check('permanent denial offers OS settings', vault.includes('permission.canAskAgain === false') && vault.includes('Linking.openSettings()'));
check('camera is rear/image only', vault.includes('CameraType.back') && vault.includes("mediaTypes: ['images']"));
check('camera launch snapshots candidate doc type', vault.includes('const selectedType = replacement?.document_type ?? documentType'));
check('camera shares temp-file generation quarantine', vault.includes('captureDocumentPickerCacheGeneration()') && vault.includes('uploadTemporaryAsset'));
check('camera shares canonical vault uploader', vault.includes('uploadPickedJobseekerDocument') && api.includes("client.rpc('hc_register_jobseeker_document_source'"));
check('generic asset keeps PDF/JPEG/PNG validation', api.includes('CandidateDocumentAsset') && api.includes('bytesMatchMime'));
check('Android pending result is reconciled on bootstrap', recovery.includes('ImagePicker.getPendingResultAsync()') && boundary.includes('reconcilePendingCameraCaptureResult'));
check('recovered pending image is physically deleted', recovery.includes('discardUnregisteredDocumentPickerCache(uri)'));
check('recovery notice tells user to retake', recovery.includes('CAMERA_RECOVERY_NOTICE_KEY') && vault.includes('撮影中にアプリが終了したため'));
check('stub typecheck knows image-picker', stub.includes("declare module 'expo-image-picker'"));
check('release preflight requires camera plugin/dependency', preflight.includes('IMAGE_PICKER_CAMERA_PERMISSION') && preflight.includes('IMAGE_PICKER_DEPENDENCY'));
check('physical-device QA explicitly required', qa.includes('iOS実機') && qa.includes('Android実機') && qa.includes('BLOCKED'));

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.error('Native camera document capture contract failed:\n- ' + failed.join('\n- ')); process.exit(1); }
console.log(`Native camera document capture contract PASS (${checks.length}/${checks.length})`);
