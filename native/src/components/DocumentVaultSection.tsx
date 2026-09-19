import { useSession } from '@clerk/expo';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Button, Linking, Text, View } from 'react-native';
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

const labels: Record<JobseekerDocumentType, string> = {
  resume: '履歴書',
  work_history: '職務経歴書',
  nursery_teacher_license: '保育士証',
  kindergarten_license: '幼稚園教諭免許',
  other: 'その他',
};
const types = Object.keys(labels) as JobseekerDocumentType[];

function formatBytes(value: number | null) {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentVaultSection() {
  const { session } = useSession();
  const user = session?.user ?? null;
  const privacy = usePrivateDataQuarantine();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [documents, setDocuments] = useState<JobseekerDocument[]>([]);
  const [documentType, setDocumentType] = useState<JobseekerDocumentType>('resume');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(user?.id ?? null);
  const mountedRef = useRef(true);
  const loadGenerationRef = useRef(0);
  userIdRef.current = user?.id ?? null;

  useEffect(() => () => {
    mountedRef.current = false;
    userIdRef.current = null;
  }, []);


  const load = useCallback(async () => {
    if (!privacy.canAccessPrivateData()) return;
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    let pinned: Awaited<ReturnType<typeof pinCandidateAction>> = null;
    try {
      pinned = await pinCandidateAction();
      if (!pinned || generation !== loadGenerationRef.current) return;
      const next = await listJobseekerDocuments(pinned.client);
      if (!pinned.isCurrent() || generation !== loadGenerationRef.current) return;
      setDocuments(next);
    } catch (error) {
      if (generation === loadGenerationRef.current && (!pinned || pinned.isCurrent())) {
        Alert.alert('応募書類を読み込めませんでした', String((error as { message?: unknown })?.message ?? error));
      }
    } finally {
      if (generation === loadGenerationRef.current && (!pinned || pinned.isCurrent())) setLoading(false);
    }
  }, [pinCandidateAction, privacy.canAccessPrivateData]);

  useEffect(() => {
    if (!privacy.shieldVisible) void load();
  }, [load, privacy.shieldVisible]);

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

    if (!pickerSessionStillValid) {
      try { await consumePendingDocumentPickerCache(pickerOwnerId, asset.uri); } catch {}
      return;
    }

    setBusyId('upload');
    const pinned = await pinCandidateAction();
    if (!pinned || pinned.ownerId !== pickerOwnerId) {
      try { await consumePendingDocumentPickerCache(pickerOwnerId, asset.uri); } catch {}
      return;
    }
    const sameTypeExists = documents.some((item) => item.document_type === selectedType);
    await uploadPickedJobseekerDocument(pinned.client, pickerOwnerId, selectedType, asset, {
      makeDefault: !sameTypeExists,
      canStartUpload: () =>
        pinned.isCurrent() &&
        mountedRef.current &&
        userIdRef.current === pickerOwnerId &&
        privacy.canAccessPrivateData(),
    });

    if (!pinned.isCurrent() || !mountedRef.current || userIdRef.current !== pickerOwnerId || !privacy.canAccessPrivateData()) return;
    await load();
    if (mountedRef.current && userIdRef.current === pickerOwnerId && privacy.canAccessPrivateData()) {
      Alert.alert('保存しました', `${labels[selectedType]}を応募書類として保存しました。`);
    }
  }

  async function pickAndUpload() {
    const pickerOwnerId = userIdRef.current;
    const selectedType = documentType;
    if (!pickerOwnerId || busyId || !privacy.canAccessPrivateData()) return;
    const pickerCacheGeneration = captureDocumentPickerCacheGeneration();
    setBusyId('picker');

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
      }, pickerCacheGeneration);
    } catch (error) {
      if (mountedRef.current && userIdRef.current === pickerOwnerId && privacy.canAccessPrivateData()) {
        Alert.alert('書類を保存できませんでした', String((error as { message?: unknown })?.message ?? error));
      }
    } finally {
      if (mountedRef.current) setBusyId(null);
    }
  }

  async function captureAndUpload() {
    const pickerOwnerId = userIdRef.current;
    const selectedType = documentType;
    if (!pickerOwnerId || busyId || !privacy.canAccessPrivateData()) return;
    setBusyId('camera-permission');

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
      setBusyId('camera');
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
      }, pickerCacheGeneration);
    } catch (error) {
      if (mountedRef.current && userIdRef.current === pickerOwnerId && privacy.canAccessPrivateData()) {
        Alert.alert('撮影した書類を保存できませんでした', String((error as { message?: unknown })?.message ?? error));
      }
    } finally {
      if (mountedRef.current) setBusyId(null);
    }
  }

  async function open(document: JobseekerDocument) {
    setBusyId(document.id);
    let pinned: Awaited<ReturnType<typeof pinCandidateAction>> = null;
    try {
      // A private signed URL is itself candidate-scoped sensitive capability.
      // Never let an async signed-URL request that started under Candidate A
      // complete into Candidate B's UI after Clerk session replacement.
      pinned = await pinCandidateAction();
      if (!pinned) return;
      const url = await createJobseekerDocumentSignedUrl(pinned.client, document);
      if (!pinned.isCurrent()) return;
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
    setBusyId(document.id);
    let pinned: Awaited<ReturnType<typeof pinCandidateAction>> = null;
    try {
      pinned = await pinCandidateAction();
      if (!pinned) return;
      await setDefaultJobseekerDocument(pinned.client, document.id);
      if (!pinned.isCurrent()) return;
      await load();
    } catch (error) {
      if (!pinned || pinned.isCurrent()) {
        Alert.alert('既定書類を変更できませんでした', String((error as { message?: unknown })?.message ?? error));
      }
    } finally { if (!pinned || pinned.isCurrent()) setBusyId(null); }
  }

  function confirmDelete(document: JobseekerDocument) {
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
    setBusyId(document.id);
    let pinned: Awaited<ReturnType<typeof pinCandidateAction>> = null;
    try {
      pinned = await pinCandidateAction();
      if (!pinned) return;
      await deleteJobseekerDocument(pinned.client, document);
      if (!pinned.isCurrent()) return;
      await load();
      Alert.alert('削除しました', '書類庫から削除しました。提出済みの応募書類は保持されます。');
    } catch (error) {
      if (!pinned || pinned.isCurrent()) {
        Alert.alert('書類を削除できませんでした', String((error as { message?: unknown })?.message ?? error));
      }
    } finally { if (!pinned || pinned.isCurrent()) setBusyId(null); }
  }

  return <View testID="document-vault-section" style={{ gap: 12 }}>
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 18, fontWeight: '700' }}>応募書類</Text>
      <Text>履歴書や資格証を一度保存し、応募先へ必要な書類だけ提出できます。</Text>
      <Text style={{ color: '#666', fontSize: 12 }}>PDF・JPEG・PNG、1ファイル10MBまで。提出済みコピーは後から元ファイルを削除しても応募記録として保持されます。</Text>
    </View>

    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {types.map((type) => <Button key={type} title={`${documentType === type ? '✓ ' : ''}${labels[type]}`} disabled={busyId !== null} onPress={() => setDocumentType(type)} />)}
    </View>
    <View style={{ gap: 8 }}>
      <Button testID="document-vault-add" title={busyId === 'upload' ? '保存中…' : `${labels[documentType]}をファイルから追加`} disabled={busyId !== null} onPress={() => void pickAndUpload()} />
      <Button testID="document-vault-camera" title={busyId === 'camera' || busyId === 'camera-permission' ? 'カメラを準備中…' : `${labels[documentType]}をカメラで撮影`} disabled={busyId !== null} onPress={() => void captureAndUpload()} />
    </View>

    {loading ? <ActivityIndicator /> : documents.length ? documents.map((document) => <View testID={`document-vault-item-${document.id}`} key={document.id} style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 12, gap: 8 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ fontWeight: '700' }}>{labels[document.document_type]}{document.is_default ? ' ・応募時に使用' : ''}</Text>
        <Text numberOfLines={1}>{document.title}</Text>
        {document.file_size ? <Text style={{ color: '#666', fontSize: 12 }}>{formatBytes(document.file_size)}</Text> : null}
      </View>
      <View style={{ gap: 8 }}>
        <Button testID={`document-vault-open-${document.id}`} title="開く" disabled={busyId !== null} onPress={() => void open(document)} />
        {!document.is_default ? <Button testID={`document-vault-default-${document.id}`} title="応募時に使う" disabled={busyId !== null} onPress={() => void makeDefault(document)} /> : null}
        <Button testID={`document-vault-delete-${document.id}`} title="削除" color="#9f2d2d" disabled={busyId !== null} onPress={() => confirmDelete(document)} />
      </View>
    </View>) : <Text style={{ color: '#666' }}>保存した応募書類はまだありません。</Text>}
  </View>;
}
