import { useSession } from '@clerk/expo';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import { usePrivateDataQuarantine } from '../hooks/usePrivateDataQuarantine';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { captureDocumentPickerCacheGeneration, consumePendingDocumentPickerCache, discardUnregisteredDocumentPickerCache, registerPendingDocumentPickerCache } from '../lib/documentPickerCache';
import {
  createJobseekerDocumentSignedUrl,
  deleteJobseekerDocument,
  listJobseekerDocuments,
  setDefaultJobseekerDocument,
  uploadPickedJobseekerDocument,
  type CandidateDocumentAsset,
  type JobseekerDocument,
  type JobseekerDocumentType,
} from '../lib/documentVaultApi';
import { consumeCameraCaptureRecoveryNotice } from '../lib/cameraCaptureRecovery';
import { candidateViewOwnerKey, readCandidateFreshlyVerifiedView, type CandidateOwnedView } from '../lib/candidateViewOwner';
import { assertCandidateDocumentListOwner, canActOnCandidateDocument, confirmCandidateDocumentMutation } from '../lib/documentVaultPrivacy';
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPE_ORDER, evidenceTypesForQualification } from '../lib/documentTypes';
import { qualificationEvidenceCounts } from '../lib/qualificationEvidenceCounts';

// Keep the document catalogue and exact qualification mapping in sync with Web.
const labels = DOCUMENT_TYPE_LABELS;
const types = DOCUMENT_TYPE_ORDER;

function VaultAction({ title, onPress, disabled = false, testID, primary = false }: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  primary?: boolean;
}) {
  return <Pressable
    testID={testID}
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => ({
      borderRadius: 10,
      borderWidth: 1,
      borderColor: primary ? '#cb477a' : '#e8b5c9',
      backgroundColor: primary ? '#cf4c80' : '#fff7fa',
      paddingHorizontal: 13,
      paddingVertical: 11,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: disabled ? 0.5 : pressed ? 0.82 : 1,
    })}
  >
    <Text style={{ fontSize: 14, fontWeight: '700', color: primary ? '#fff' : '#9a315d', textAlign: 'center' }}>{title}</Text>
  </Pressable>;
}

function formatBytes(value: number | null) {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * `initialType` preselects the type to add (the apply step opens this section for a missing
 * document). `onDocumentsChanged` receives every canonical reload so the caller can refresh.
 */
export function DocumentVaultSection({ initialType = 'resume', onDocumentsChanged, qualifications }: {
  initialType?: JobseekerDocumentType;
  onDocumentsChanged?: (documents: JobseekerDocument[]) => void;
  /** Self-declared profile qualifications; uploaded copies are NOT verified credentials. */
  qualifications?: readonly string[];
} = {}) {
  const router = useRouter();
  const { session } = useSession();
  const user = session?.user ?? null;
  const privacy = usePrivateDataQuarantine();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const ownerKey = candidateViewOwnerKey(user?.id, session?.id);
  const ownerKeyRef = useRef(ownerKey);
  ownerKeyRef.current = ownerKey;
  const mountedRef = useRef(true);
  const privateAllowed = Boolean(ownerKey) && !privacy.shieldVisible && privacy.canAccessPrivateData();
  const freshlyVerifiedOwner = useRef<string | null>(null);
  if (!privateAllowed) freshlyVerifiedOwner.current = null;
  const [ownedDocuments, setOwnedDocuments] = useState<CandidateOwnedView<JobseekerDocument[]> | null>(null);
  const verifiedDocuments = readCandidateFreshlyVerifiedView(ownedDocuments, ownerKey, privateAllowed, freshlyVerifiedOwner.current);
  const documents = verifiedDocuments ?? [];
  const onDocumentsChangedRef = useRef(onDocumentsChanged);
  onDocumentsChangedRef.current = onDocumentsChanged;
  const setDocuments = useCallback((next: JobseekerDocument[], verifiedOwnerKey: string) => {
    if (!mountedRef.current || !privacy.canAccessPrivateData() || ownerKeyRef.current !== verifiedOwnerKey) return;
    freshlyVerifiedOwner.current = verifiedOwnerKey;
    setOwnedDocuments({ ownerKey: verifiedOwnerKey, value: next });
    onDocumentsChangedRef.current?.(next);
  }, [privacy.canAccessPrivateData]);
  const [documentType, setDocumentType] = useState<JobseekerDocumentType>(initialType);
  const [showTypes, setShowTypes] = useState(false);
  useEffect(() => { setDocumentType(initialType); }, [initialType]);
  useEffect(() => { setShowTypes(false); }, [ownerKey, privateAllowed]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(user?.id ?? null);
  const loadGenerationRef = useRef(0);
  userIdRef.current = user?.id ?? null;

  useEffect(() => () => {
    mountedRef.current = false;
    userIdRef.current = null;
  }, []);

  const load = useCallback(async () => {
    const requestOwnerKey = ownerKeyRef.current;
    if (!requestOwnerKey || !privacy.canAccessPrivateData()) return;
    const generation = ++loadGenerationRef.current;
    freshlyVerifiedOwner.current = null;
    setOwnedDocuments(null);
    onDocumentsChangedRef.current?.([]);
    setLoading(true);
    let pinned: Awaited<ReturnType<typeof pinCandidateAction>> = null;
    try {
      pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() || generation !== loadGenerationRef.current ||
          candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== requestOwnerKey) return;
      const next = await listJobseekerDocuments(pinned.client);
      if (!pinned.isCurrent() || generation !== loadGenerationRef.current ||
          ownerKeyRef.current !== requestOwnerKey || !privacy.canAccessPrivateData()) return;
      assertCandidateDocumentListOwner(next, pinned.ownerId);
      setDocuments(next, requestOwnerKey);
    } catch (error) {
      if (generation === loadGenerationRef.current && ownerKeyRef.current === requestOwnerKey &&
          privacy.canAccessPrivateData() && (!pinned || pinned.isCurrent())) {
        Alert.alert('応募書類を読み込めませんでした', String((error as { message?: unknown })?.message ?? error));
      }
    } finally {
      if (generation === loadGenerationRef.current && ownerKeyRef.current === requestOwnerKey &&
          privacy.canAccessPrivateData() && (!pinned || pinned.isCurrent())) setLoading(false);
    }
  }, [pinCandidateAction, privacy.canAccessPrivateData, setDocuments]);

  useEffect(() => {
    if (!privateAllowed) {
      loadGenerationRef.current += 1;
      freshlyVerifiedOwner.current = null;
      setOwnedDocuments(null);
      onDocumentsChangedRef.current?.([]);
      setLoading(true);
      setBusyId(null);
      return;
    }
    void load();
    return () => { loadGenerationRef.current += 1; freshlyVerifiedOwner.current = null; };
  }, [ownerKey, privateAllowed, load]);

  useEffect(() => {
    if (privacy.shieldVisible || !user?.id) return;
    void consumeCameraCaptureRecoveryNotice().then((recovered) => {
      if (!recovered || !mountedRef.current || !privacy.canAccessPrivateData()) return;
      Alert.alert('撮影をやり直してください', '撮影中にアプリが終了したため、一時画像を安全に削除しました。もう一度撮影してください。');
    }).catch(() => undefined);
  }, [privacy.canAccessPrivateData, privacy.shieldVisible, user?.id]);

  async function uploadTemporaryAsset(
    pickerOwnerId: string,
    selectedType: JobseekerDocumentType,
    asset: CandidateDocumentAsset,
    pickerCacheGeneration: number,
    replacement: JobseekerDocument | null = null,
  ) {
    try {
      await registerPendingDocumentPickerCache(pickerOwnerId, asset.uri, pickerCacheGeneration);
    } catch (error) {
      try { discardUnregisteredDocumentPickerCache(asset.uri); } catch {}
      if (mountedRef.current && userIdRef.current === pickerOwnerId && privacy.canAccessPrivateData()) {
        Alert.alert('書類を準備できませんでした', String((error as { message?: unknown })?.message ?? error));
      }
      return;
    }

    const pickerSessionStillValid =
      mountedRef.current &&
      userIdRef.current === pickerOwnerId &&
      privacy.canAccessPrivateData();

    if (!pickerSessionStillValid || (replacement && replacement.jobseeker_clerk_user_id !== pickerOwnerId)) {
      try { await consumePendingDocumentPickerCache(pickerOwnerId, asset.uri); } catch {}
      return;
    }

    setBusyId(replacement ? `replace-${replacement.id}` : 'upload');
    const pinned = await pinCandidateAction();
    const pinnedOwnerKey = pinned ? candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) : null;
    if (!pinned?.isCurrent() || pinned.ownerId !== pickerOwnerId ||
        !pinnedOwnerKey || ownerKeyRef.current !== pinnedOwnerKey || !privacy.canAccessPrivateData()) {
      try { await consumePendingDocumentPickerCache(pickerOwnerId, asset.uri); } catch {}
      return;
    }

    const sameTypeExists = documents.some((item) => item.document_type === selectedType);
    const saved = await uploadPickedJobseekerDocument(pinned.client, pickerOwnerId, selectedType, asset, {
      // During a replacement the old default stays authoritative until the new
      // source is canonically visible. This prevents a failed/ambiguous upload
      // from removing or silently replacing the last known-good default.
      makeDefault: !replacement && !sameTypeExists,
      canStartUpload: () =>
        pinned.isCurrent() &&
        mountedRef.current &&
        userIdRef.current === pickerOwnerId &&
        privacy.canAccessPrivateData(),
    });

    if (!pinned.isCurrent() || !mountedRef.current || userIdRef.current !== pickerOwnerId || !privacy.canAccessPrivateData()) return;

    if (replacement) {
      // Never delete or mutate the old document until the newly uploaded source
      // is visible through the canonical candidate-scoped read path.
      let canonical = await listJobseekerDocuments(pinned.client);
      if (!pinned.isCurrent()) return;
      let canonicalSaved = canonical.find((item) => item.id === saved.id) ?? null;
      let canonicalOld = canonical.find((item) => item.id === replacement.id) ?? null;
      if (!canonicalSaved || canonicalSaved.jobseeker_clerk_user_id !== pickerOwnerId || canonicalSaved.document_type !== replacement.document_type) {
        throw new Error('新しい書類の保存結果を確認できませんでした。古い書類は変更していません。');
      }

      if (replacement.is_default && !canonicalSaved.is_default) {
        try {
          await setDefaultJobseekerDocument(pinned.client, canonicalSaved.id);
        } catch (error) {
          // A dropped response may happen after the server committed the default
          // switch. Re-read canonical state before deciding that it failed.
          canonical = await listJobseekerDocuments(pinned.client);
          canonicalSaved = canonical.find((item) => item.id === saved.id) ?? null;
          canonicalOld = canonical.find((item) => item.id === replacement.id) ?? null;
          if (!canonicalSaved?.is_default) throw error;
        }
      }

      if (!pinned.isCurrent() || !mountedRef.current || userIdRef.current !== pickerOwnerId || !privacy.canAccessPrivateData()) return;

      if (canonicalOld) {
        try {
          await deleteJobseekerDocument(pinned.client, canonicalOld);
        } catch {
          // Deletion can also finish server-side before a network response is
          // lost. Recover from canonical state; otherwise keep both sources so
          // a restart can never present a false "replacement complete" state.
        }
      }

      canonical = await listJobseekerDocuments(pinned.client);
      if (!pinned.isCurrent()) return;
      canonicalSaved = canonical.find((item) => item.id === saved.id) ?? null;
      canonicalOld = canonical.find((item) => item.id === replacement.id) ?? null;
      if (!privacy.canAccessPrivateData() || ownerKeyRef.current !== pinnedOwnerKey) return;
      assertCandidateDocumentListOwner(canonical, pickerOwnerId);
      setDocuments(canonical, pinnedOwnerKey);

      if (!canonicalSaved) {
        Alert.alert('差し替え結果を確認できません', '新しい書類の状態を確認できませんでした。古い書類は削除しません。一覧を再読み込みして確認してください。');
        return;
      }
      if (replacement.is_default && !canonicalSaved.is_default) {
        Alert.alert('差し替えを完了できませんでした', '新しい書類は保存されていますが、応募時に使う書類への切り替えを確認できませんでした。古い書類は残しています。');
        return;
      }
      if (canonicalOld) {
        Alert.alert('新しい書類は保存済みです', '新しい書類は保存されていますが、古い書類の削除だけ完了できませんでした。二重アップロードせず、一覧から古い書類を削除してください。');
        return;
      }

      Alert.alert('差し替えました', `${labels[selectedType]}を新しい書類に差し替えました。提出済みの応募書類コピーは変更されません。`);
      return;
    }

    // Confirm the uploaded file through candidate-scoped canonical records.
    // A successful write response alone is not sufficient for a success alert.
    const canonical = await listJobseekerDocuments(pinned.client);
    if (!pinned.isCurrent() || !mountedRef.current || ownerKeyRef.current !== pinnedOwnerKey ||
        !privacy.canAccessPrivateData()) return;
    confirmCandidateDocumentMutation(canonical, pickerOwnerId, saved.id, 'uploaded');
    setDocuments(canonical, pinnedOwnerKey);
    Alert.alert('保存しました', `${labels[selectedType]}を応募書類として保存しました。`);
  }

  async function pickAndUpload(replacement: JobseekerDocument | null = null, explicitType: JobseekerDocumentType | null = null) {
    const pickerOwnerId = userIdRef.current;
    const selectedType = replacement?.document_type ?? explicitType ?? documentType;
    if (!pickerOwnerId || busyId || verifiedDocuments === null || !privateAllowed) return;
    const pickerCacheGeneration = captureDocumentPickerCacheGeneration();
    setBusyId(replacement ? `replace-picker-${replacement.id}` : 'picker');

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const picked = result.assets[0];
      await uploadTemporaryAsset(pickerOwnerId, selectedType, {
        uri: picked.uri,
        name: picked.name,
        size: picked.size ?? null,
        mimeType: picked.mimeType ?? null,
      }, pickerCacheGeneration, replacement);
    } catch (error) {
      if (mountedRef.current && userIdRef.current === pickerOwnerId && privacy.canAccessPrivateData()) {
        Alert.alert(replacement ? '書類を差し替えできませんでした' : '書類を保存できませんでした', String((error as { message?: unknown })?.message ?? error));
      }
    } finally {
      if (mountedRef.current) setBusyId(null);
    }
  }

  async function captureAndUpload(replacement: JobseekerDocument | null = null) {
    const pickerOwnerId = userIdRef.current;
    const selectedType = replacement?.document_type ?? documentType;
    if (!pickerOwnerId || busyId || verifiedDocuments === null || !privateAllowed) return;
    setBusyId(replacement ? `replace-camera-permission-${replacement.id}` : 'camera-permission');

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!mountedRef.current || userIdRef.current !== pickerOwnerId || !privacy.canAccessPrivateData()) return;
      if (!permission.granted) {
        if (permission.canAskAgain === false) {
          Alert.alert('カメラを許可してください', '設定からHoiku Colorのカメラ利用を許可すると、資格証や書類を撮影できます。', [
            { text: 'キャンセル', style: 'cancel' },
            { text: '設定を開く', onPress: () => void Linking.openSettings() },
          ]);
        } else {
          Alert.alert('カメラの許可が必要です', '書類を撮影するにはカメラの利用を許可してください。');
        }
        return;
      }

      const pickerCacheGeneration = captureDocumentPickerCacheGeneration();
      setBusyId(replacement ? `replace-camera-${replacement.id}` : 'camera');
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        cameraType: ImagePicker.CameraType.back,
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const captured = result.assets[0];
      await uploadTemporaryAsset(pickerOwnerId, selectedType, {
        uri: captured.uri,
        name: captured.fileName || `${selectedType}-${Date.now()}.jpg`,
        size: captured.fileSize ?? null,
        mimeType: captured.mimeType || 'image/jpeg',
      }, pickerCacheGeneration, replacement);
    } catch (error) {
      if (mountedRef.current && userIdRef.current === pickerOwnerId && privacy.canAccessPrivateData()) {
        Alert.alert(replacement ? '撮影した書類を差し替えできませんでした' : '撮影した書類を保存できませんでした', String((error as { message?: unknown })?.message ?? error));
      }
    } finally {
      if (mountedRef.current) setBusyId(null);
    }
  }

  async function open(document: JobseekerDocument) {
    if (!canActOnCandidateDocument(document, verifiedDocuments, user?.id ?? null, ownerKey, freshlyVerifiedOwner.current, privateAllowed)) return;
    setBusyId(document.id);
    let pinned: Awaited<ReturnType<typeof pinCandidateAction>> = null;
    try {
      // A private signed URL is itself candidate-scoped sensitive capability.
      // Never let an async signed-URL request that started under Candidate A
      // complete into Candidate B's UI after Clerk session replacement.
      pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) return;
      const url = await createJobseekerDocumentSignedUrl(pinned.client, document);
      if (!pinned.isCurrent() || !privacy.canAccessPrivateData() || ownerKeyRef.current !== ownerKey ||
          !canActOnCandidateDocument(document, verifiedDocuments, user?.id ?? null, ownerKey, freshlyVerifiedOwner.current, true)) return;
      await Linking.openURL(url);
    } catch (error) {
      if (!pinned || pinned.isCurrent()) {
        Alert.alert('書類を開けませんでした', String((error as { message?: unknown })?.message ?? error));
      }
    } finally {
      if (!pinned || pinned.isCurrent()) setBusyId(null);
    }
  }

  async function makeDefault(document: JobseekerDocument) {
    if (!canActOnCandidateDocument(document, verifiedDocuments, user?.id ?? null, ownerKey, freshlyVerifiedOwner.current, privateAllowed)) return;
    setBusyId(document.id);
    let pinned: Awaited<ReturnType<typeof pinCandidateAction>> = null;
    try {
      pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey || !privacy.canAccessPrivateData()) return;
      await setDefaultJobseekerDocument(pinned.client, document.id);
      if (!pinned.isCurrent() || !privacy.canAccessPrivateData() || ownerKeyRef.current !== ownerKey) return;
      const canonical = await listJobseekerDocuments(pinned.client);
      if (!pinned.isCurrent() || !privacy.canAccessPrivateData() || ownerKeyRef.current !== ownerKey) return;
      confirmCandidateDocumentMutation(canonical, pinned.ownerId, document.id, 'made-default');
      setDocuments(canonical, ownerKey!);
    } catch (error) {
      if (!pinned || pinned.isCurrent()) {
        Alert.alert('既定書類を変更できませんでした', String((error as { message?: unknown })?.message ?? error));
      }
    } finally { if (!pinned || pinned.isCurrent()) setBusyId(null); }
  }

  function confirmDelete(document: JobseekerDocument) {
    if (!canActOnCandidateDocument(document, verifiedDocuments, user?.id ?? null, ownerKey, freshlyVerifiedOwner.current, privateAllowed)) return;
    Alert.alert(
      '応募書類を削除しますか？',
      `${document.title}\nすでに応募先へ提出済みのコピーは削除されません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: () => void remove(document) },
      ],
    );
  }

  async function remove(document: JobseekerDocument) {
    if (!canActOnCandidateDocument(document, verifiedDocuments, user?.id ?? null, ownerKey, freshlyVerifiedOwner.current, privateAllowed)) return;
    setBusyId(document.id);
    let pinned: Awaited<ReturnType<typeof pinCandidateAction>> = null;
    try {
      pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey || !privacy.canAccessPrivateData()) return;
      await deleteJobseekerDocument(pinned.client, document);
      if (!pinned.isCurrent() || !privacy.canAccessPrivateData() || ownerKeyRef.current !== ownerKey) return;
      const canonical = await listJobseekerDocuments(pinned.client);
      if (!pinned.isCurrent() || !privacy.canAccessPrivateData() || ownerKeyRef.current !== ownerKey) return;
      confirmCandidateDocumentMutation(canonical, pinned.ownerId, document.id, 'deleted');
      setDocuments(canonical, ownerKey!);
      Alert.alert('削除しました', '書類庫から削除しました。提出済みの応募書類は保持されます。');
    } catch (error) {
      if (!pinned || pinned.isCurrent()) {
        Alert.alert('書類を削除できませんでした', String((error as { message?: unknown })?.message ?? error));
      }
    } finally { if (!pinned || pinned.isCurrent()) setBusyId(null); }
  }

  if (!privateAllowed) return <View testID="document-vault-private-shield"><Text>応募書類を表示するには、ログイン状態を確認してください。</Text></View>;

  return <View testID="document-vault-section" style={{ gap: 14 }}>
    <View style={{ gap: 6 }}>
      <Text accessibilityRole="header" style={{ fontSize: 19, fontWeight: '700', color: '#30232c' }}>応募書類</Text>
      <Text style={{ fontSize: 14, lineHeight: 22, color: '#493c43' }}>一度保存した履歴書や資格証を、次の応募でも再利用できます。ファイルは非公開で保存され、応募した園にだけ提出用コピーが共有されます。</Text>
    </View>

    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: '#30232c' }}>追加する書類の種類</Text>
      <Pressable
        testID="document-vault-type-selector"
        accessibilityRole="button"
        disabled={busyId !== null || verifiedDocuments === null}
        onPress={() => setShowTypes((current) => !current)}
        style={{ borderWidth: 1, borderColor: '#e8b5c9', borderRadius: 10, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#30232c' }}>{labels[documentType]}</Text>
        <Text style={{ fontSize: 16, color: '#9a315d' }}>{showTypes ? '⌃' : '⌄'}</Text>
      </Pressable>
      {showTypes ? <View testID="document-vault-type-options" style={{ borderWidth: 1, borderColor: '#efc7d7', borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' }}>
        {types.map((type) => <Pressable
          key={type}
          testID={`document-vault-type-${type}`}
          accessibilityRole="button"
          accessibilityState={{ selected: documentType === type }}
          disabled={busyId !== null || verifiedDocuments === null}
          onPress={() => { setDocumentType(type); setShowTypes(false); }}
          style={{ minHeight: 44, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderColor: '#f6e7ee', backgroundColor: documentType === type ? '#fff0f6' : '#fff' }}
        ><Text style={{ fontSize: 15, fontWeight: documentType === type ? '700' : '500', color: '#30232c' }}>{documentType === type ? '✓ ' : ''}{labels[type]}</Text></Pressable>)}
      </View> : null}
      <VaultAction testID="document-vault-add" title={busyId === 'upload' ? '保存しています…' : '書類を追加'} primary disabled={busyId !== null || verifiedDocuments === null} onPress={() => void pickAndUpload()} />
      <VaultAction testID="document-vault-camera" title={busyId === 'camera' || busyId === 'camera-permission' ? 'カメラを準備しています…' : 'カメラで撮影して追加'} disabled={busyId !== null || verifiedDocuments === null} onPress={() => void captureAndUpload()} />
      <Text style={{ color: '#65515b', fontSize: 13, lineHeight: 20 }}>PDF・画像（JPEG / PNG）、1ファイル10MBまで。各種類の「応募時に使う」を1件選べます。</Text>
      <VaultAction testID="document-vault-resume-builder" title="履歴書・職務経歴書をアプリで作る" disabled={busyId !== null} onPress={() => router.push('/resume' as never)} />
      {busyId !== null ? <Text accessibilityRole="text" style={{ fontSize: 13, color: '#65515b' }}>書類の処理中です。画面を閉じずにお待ちください。</Text> : null}
    </View>

    {qualifications !== undefined && !loading && verifiedDocuments !== null ? <View testID="document-vault-qualification-evidence" style={{ gap: 10, backgroundColor: '#fff7fa', borderRadius: 12, borderWidth: 1, borderColor: '#f0d2df', padding: 14 }}>
      <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700', color: '#30232c' }}>資格と証明書類</Text>
      <Text style={{ color: '#574651', fontSize: 14, lineHeight: 21 }}>資格はプロフィールで登録した内容（ご本人の申告）です。免許証などの写しを保存しても、資格が確認済みになるわけではありません。確認は応募先の園が行います。</Text>
      {qualifications.length ? qualifications.map((qualification, qualificationIndex) => {
        const evidence = qualificationEvidenceCounts(evidenceTypesForQualification(qualification), documents);
        return <View key={`${qualification}-${qualificationIndex}`} style={{ borderWidth: 1, borderColor: '#f0d2df', borderRadius: 10, padding: 12, backgroundColor: '#fff', gap: 8 }}>
          <Text style={{ color: '#30232c', fontWeight: '700', fontSize: 15 }}>{qualification}</Text>
          {evidence.length ? evidence.map(({ type, savedCount }) => <View key={type} style={{ gap: 7 }}>
            <Text style={{ fontSize: 14, lineHeight: 20, color: '#493c43' }}>{labels[type]}：{savedCount ? `保存済み（${savedCount}件）` : 'まだ保存されていません'}</Text>
            {savedCount === 0 ? <VaultAction
              testID={`document-vault-qualification-add-${type}`}
              title={`${labels[type]}を追加`}
              disabled={busyId !== null || verifiedDocuments === null}
              onPress={() => void pickAndUpload(null, type)}
            /> : null}
          </View>) : <Text style={{ fontSize: 14, color: '#65515b' }}>証明書類は「その他」として保存できます。</Text>}
        </View>;
      }) : <Text style={{ fontSize: 14, color: '#65515b' }}>プロフィールで資格を登録すると、ここに証明書類の保存状況が表示されます。</Text>}
    </View> : null}

    {loading ? <ActivityIndicator /> : verifiedDocuments === null ? (
      <View testID="document-vault-reload-required" style={{ gap: 8 }}>
        <Text>応募書類を確認できませんでした。通信状況を確認して再読み込みしてください。</Text>
        <VaultAction title="再読み込み" onPress={() => void load()} />
      </View>
    ) : documents.length ? <View style={{ gap: 10 }} testID="document-vault-list">
      {documents.map((document) => <View testID={`document-vault-item-${document.id}`} key={document.id} style={{ borderWidth: 1, borderColor: '#efc7d7', backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 10 }}>
        <Pressable
          testID={`document-vault-open-${document.id}`}
          accessibilityRole="button"
          disabled={busyId !== null}
          onPress={() => void open(document)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#fff0f6', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#b63e70', fontSize: 23 }}>▤</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 15, color: '#30232c', fontWeight: '700' }}>{labels[document.document_type]}{document.is_default ? <Text style={{ color: '#a43465', fontWeight: '700' }}>　応募時に使用</Text> : null}</Text>
            <Text style={{ color: '#65515b', fontSize: 13 }} numberOfLines={2}>{document.title}{document.file_size ? ` ・ ${formatBytes(document.file_size)}` : ''}</Text>
          </View>
          <Text style={{ fontSize: 19, color: '#ab5279' }}>›</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <VaultAction testID={`document-vault-replace-file-${document.id}`} title="ファイルで差し替え" disabled={busyId !== null} onPress={() => void pickAndUpload(document)} />
          <VaultAction testID={`document-vault-replace-camera-${document.id}`} title="撮影して差し替え" disabled={busyId !== null} onPress={() => void captureAndUpload(document)} />
          {!document.is_default ? <VaultAction testID={`document-vault-default-${document.id}`} title="応募時に使う" disabled={busyId !== null} onPress={() => void makeDefault(document)} /> : null}
          <VaultAction testID={`document-vault-delete-${document.id}`} title="削除" disabled={busyId !== null} onPress={() => confirmDelete(document)} />
        </View>
      </View>)}
    </View> : <View style={{ backgroundColor: '#fff7fa', borderRadius: 12, borderWidth: 1, borderColor: '#f0d2df', padding: 16, gap: 10 }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: '#30232c' }}>保存した応募書類はまだありません</Text>
      <Text style={{ fontSize: 14, color: '#65515b', lineHeight: 21 }}>まずは履歴書を1件保存してください。保育士証などはあとから追加できます。</Text>
      <VaultAction title="履歴書を追加" primary disabled={busyId !== null} onPress={() => void pickAndUpload(null, 'resume')} />
    </View>}
  </View>;
}
