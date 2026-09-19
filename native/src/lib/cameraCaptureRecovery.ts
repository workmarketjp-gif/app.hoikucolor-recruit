import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { discardUnregisteredDocumentPickerCache } from './documentPickerCache';

const CAMERA_RECOVERY_NOTICE_KEY = 'hc.native.camera-capture-recovery-notice.v1';

export async function reconcilePendingCameraCaptureResult() {
  const pending = await ImagePicker.getPendingResultAsync();
  if (!pending || !('canceled' in pending) || pending.canceled || !pending.assets?.length) return false;

  let removed = 0;
  for (const asset of pending.assets) {
    const uri = typeof asset?.uri === 'string' ? asset.uri : '';
    if (!uri) continue;
    // The pending Android result belongs to a previous JS process. Never infer
    // a Candidate or document type after restart; remove the app-private capture
    // and ask the user to take it again under the current authenticated session.
    discardUnregisteredDocumentPickerCache(uri);
    removed += 1;
  }

  if (removed > 0) {
    await SecureStore.setItemAsync(CAMERA_RECOVERY_NOTICE_KEY, '1');
    return true;
  }
  return false;
}

export async function consumeCameraCaptureRecoveryNotice() {
  const value = await SecureStore.getItemAsync(CAMERA_RECOVERY_NOTICE_KEY);
  if (value !== '1') return false;
  await SecureStore.deleteItemAsync(CAMERA_RECOVERY_NOTICE_KEY);
  return true;
}
