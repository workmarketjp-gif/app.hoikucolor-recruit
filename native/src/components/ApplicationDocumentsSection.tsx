import { useSession } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { usePrivateDataQuarantine } from '../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey, readCandidateFreshlyVerifiedView, type CandidateOwnedView } from '../lib/candidateViewOwner';
import {
  attachJobseekerDocumentToApplication,
  createAttachedApplicationDocumentSignedUrl,
  listApplicationDocumentExpectations,
  listJobseekerDocuments,
  listSubmittedApplicationDocuments,
  type ApplicationDocumentExpectation,
  type AttachedApplicationDocument,
  type JobseekerDocument,
} from '../lib/documentVaultApi';
import { getApplicationDocumentHandoffState, type ApplicationDocumentHandoffState } from '../lib/applicationJourneyApi';
import { documentTypeLabel } from '../lib/documentTypes';
import { boundedPrivateRead } from '../lib/privateReadDeadline';
import { readApplicationDocumentSnapshot } from '../lib/applicationDocumentSnapshotRead';
import { hasCanonicalApplicationAttachment, projectApplicationDocuments } from '../lib/applicationDocumentsPresentation';

type DocumentSnapshot = {
  saved: JobseekerDocument[];
  submitted: AttachedApplicationDocument[];
  expectations: ApplicationDocumentExpectation[];
};

/** Actual Web ApplicationMessages document flows; all reads/writes use the pinned candidate session. */
export function ApplicationDocumentsSection({
  applicationId,
  onHandoffReadback,
}: {
  applicationId: string;
  onHandoffReadback: (value: ApplicationDocumentHandoffState | null) => void;
}) {
  const { pinCandidateAction } = usePinnedCandidateAction();
  const router = useRouter();
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const canReadPrivate = !privacy.shieldVisible && privacy.canAccessPrivateData();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<CandidateOwnedView<DocumentSnapshot> | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const alive = useRef(true);
  const requestVersion = useRef(0);
  const mutationPending = useRef(false);
  const freshlyVerifiedOwner = useRef<string | null>(null);
  const contextLease = useRef({ ownerKey, shieldVisible: privacy.shieldVisible });
  if (!canReadPrivate) freshlyVerifiedOwner.current = null;
  const contextCurrent = contextLease.current.ownerKey === ownerKey &&
    contextLease.current.shieldVisible === privacy.shieldVisible;
  const visibleSnapshot = readCandidateFreshlyVerifiedView(
    snapshot, ownerKey, canReadPrivate && contextCurrent, freshlyVerifiedOwner.current);

  useEffect(() => {
    // React StrictMode can replay mount effects; reset the private-view lease.
    alive.current = true;
    return () => {
      alive.current = false;
      requestVersion.current += 1;
    };
  }, []);

  useEffect(() => {
    // The document panel is private even while its parent screen remains mounted.
    // A Clerk account/session switch or App Lock revokes its presentation lease.
    if (contextLease.current.ownerKey === ownerKey &&
        contextLease.current.shieldVisible === privacy.shieldVisible) return;
    contextLease.current = { ownerKey, shieldVisible: privacy.shieldVisible };
    requestVersion.current += 1;
    freshlyVerifiedOwner.current = null;
    setSnapshot(null);
    setOpen(false);
    setLoading(false);
    setError(null);
    setNotice(null);
  }, [ownerKey, privacy.shieldVisible]);

  const refresh = async () => {
    if (mutationPending.current || !ownerKey || !canReadPrivate || !contextCurrent) return;
    const requestedOwnerKey = ownerKey;
    const version = ++requestVersion.current;
    freshlyVerifiedOwner.current = null;
    setSnapshot(null); // Do not show stale private rows while a read is unverified.
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || !pinned.isCurrent() ||
          candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== requestedOwnerKey) {
        throw new Error('安全なログイン状態を確認できませんでした。');
      }
      const { saved, submitted, expectations } = await readApplicationDocumentSnapshot({
        ownerId: pinned.ownerId,
        applicationId,
        loadSaved: () => listJobseekerDocuments(pinned.client),
        loadSubmitted: () => listSubmittedApplicationDocuments(pinned.client, applicationId),
        loadExpectations: () => listApplicationDocumentExpectations(pinned.client, applicationId),
        isCurrent: () => alive.current && pinned.isCurrent() && version === requestVersion.current &&
          privacy.canAccessPrivateData(),
      });
      projectApplicationDocuments(applicationId, saved, submitted, expectations);
      if (!alive.current || !pinned.isCurrent() || !privacy.canAccessPrivateData() ||
          version !== requestVersion.current) return;
      freshlyVerifiedOwner.current = requestedOwnerKey;
      setSnapshot({ ownerKey: requestedOwnerKey, value: { saved, submitted, expectations } });
    } catch (caught) {
      if (alive.current && version === requestVersion.current) {
        setError(String((caught as { message?: unknown })?.message ?? '応募書類を読み込めませんでした。'));
      }
    } finally {
      if (alive.current && version === requestVersion.current) setLoading(false);
    }
  };

  const toggle = () => {
    if (mutationPending.current || !canReadPrivate || !ownerKey || !contextCurrent) return;
    if (open) {
      ++requestVersion.current;
      setOpen(false);
      setSnapshot(null);
      freshlyVerifiedOwner.current = null;
      setError(null);
      setNotice(null);
      setLoading(false);
    } else {
      setOpen(true);
      void refresh();
    }
  };

  const submitDocuments = async (targets: readonly JobseekerDocument[]) => {
    if (!open || !visibleSnapshot || !ownerKey || !canReadPrivate || !targets.length || mutationPending.current || loading) return;
    const model = projectApplicationDocuments(applicationId, visibleSnapshot.saved, visibleSnapshot.submitted, visibleSnapshot.expectations);
    if (targets.some((document) => !visibleSnapshot.saved.some((row) => row.id === document.id)
      || model.attachedIds.has(document.id))) return;
    const uniqueTargets = [...new Map(targets.map((document) => [document.id, document])).values()];
    const requestedOwnerKey = ownerKey;
    mutationPending.current = true;
    const version = ++requestVersion.current;
    setPending(uniqueTargets.length > 1 ? 'batch' : uniqueTargets[0].id);
    setError(null);
    setNotice(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || !pinned.isCurrent() ||
          candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== requestedOwnerKey) {
        throw new Error('安全なログイン状態を確認できませんでした。');
      }
      // One source at a time: session revocation must prevent the next new write.
      for (const document of uniqueTargets) {
        if (!alive.current || !pinned.isCurrent() || !privacy.canAccessPrivateData() ||
            version !== requestVersion.current) return;
        try {
          await attachJobseekerDocumentToApplication(pinned.client, document, applicationId);
        } catch {
          // Ambiguous transport reply: rely on canonical readback, never retry blindly.
        }
      }
      const { saved, submitted, expectations } = await readApplicationDocumentSnapshot({
        ownerId: pinned.ownerId,
        applicationId,
        loadSaved: () => listJobseekerDocuments(pinned.client),
        loadSubmitted: () => listSubmittedApplicationDocuments(pinned.client, applicationId),
        loadExpectations: () => listApplicationDocumentExpectations(pinned.client, applicationId),
        isCurrent: () => alive.current && pinned.isCurrent() && version === requestVersion.current &&
          privacy.canAccessPrivateData(),
      });
      projectApplicationDocuments(applicationId, saved, submitted, expectations);
      if (!alive.current || !pinned.isCurrent() || !privacy.canAccessPrivateData() ||
          version !== requestVersion.current) return;
      freshlyVerifiedOwner.current = requestedOwnerKey;
      setSnapshot({ ownerKey: requestedOwnerKey, value: { saved, submitted, expectations } });
      const confirmed = uniqueTargets.filter((document) =>
        hasCanonicalApplicationAttachment(applicationId, document.id, submitted));
      if (confirmed.length === uniqueTargets.length) {
        setNotice(uniqueTargets.length > 1
          ? '未提出書類' + confirmed.length + '件をこの応募へ提出しました。'
          : documentTypeLabel(uniqueTargets[0].document_type) + 'をこの応募先へ提出しました。');
      } else {
        setError('応募書類' + uniqueTargets.length + '件のうち' + (uniqueTargets.length - confirmed.length) + '件の提出を確認できませんでした。最新の提出状況を確認してください。');
      }
      try {
        const handoff = await boundedPrivateRead(() => {
          if (!alive.current || !pinned.isCurrent() || version !== requestVersion.current) {
            throw new Error('閲覧状態が変わったため確認を中止しました。');
          }
          return getApplicationDocumentHandoffState(pinned.client, applicationId);
        });
        if (alive.current && pinned.isCurrent() && privacy.canAccessPrivateData() &&
            version === requestVersion.current) onHandoffReadback(handoff);
      } catch {
        if (alive.current && pinned.isCurrent() && privacy.canAccessPrivateData() &&
            version === requestVersion.current) onHandoffReadback(null);
      }
    } catch {
      if (alive.current && version === requestVersion.current) {
        setSnapshot(null); // Read failure after a write is ambiguous: prohibit repeat until refresh.
        setError('提出結果を確認できませんでした。重複を防ぐため応募書類を再読み込みしてください。');
      }
    } finally {
      mutationPending.current = false;
      if (alive.current && version === requestVersion.current) setPending(null);
    }
  };

  const openSubmitted = async (document: AttachedApplicationDocument) => {
    if (!visibleSnapshot || !canReadPrivate || !ownerKey || !open || mutationPending.current || loading ||
      !visibleSnapshot.submitted.some((row) => row.id === document.id && row.application_id === applicationId)) return;
    mutationPending.current = true;
    const version = ++requestVersion.current;
    const requestedOwnerKey = ownerKey;
    setPending('open-' + document.id);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || !pinned.isCurrent()) throw new Error('安全なログイン状態を確認できませんでした。');
      if (candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== requestedOwnerKey ||
          !alive.current || !privacy.canAccessPrivateData() ||
          version !== requestVersion.current) {
        throw new Error('安全なログイン状態を確認できませんでした。');
      }
      const url = await createAttachedApplicationDocumentSignedUrl(pinned.client, document);
      if (!alive.current || !pinned.isCurrent() || !privacy.canAccessPrivateData() ||
          version !== requestVersion.current) return;
      await Linking.openURL(url); // Existing vault uses the OS handler; URL is HTTPS-only.
    } catch (caught) {
      if (alive.current && version === requestVersion.current) {
        setError(String((caught as { message?: unknown })?.message ?? '提出済み書類を開けませんでした。'));
      }
    } finally {
      mutationPending.current = false;
      if (alive.current && version === requestVersion.current) setPending(null);
    }
  };

  const model = visibleSnapshot ? projectApplicationDocuments(applicationId, visibleSnapshot.saved, visibleSnapshot.submitted, visibleSnapshot.expectations) : null;
  const blocked = loading || pending !== null || mutationPending.current || !canReadPrivate || !contextCurrent;
  if (!canReadPrivate || !ownerKey || !contextCurrent) {
    return <View testID="application-documents-private-shield" />;
  }

  return (
    <View style={styles.container} testID="application-documents-section">
      <Pressable style={styles.button} onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: open }} testID="application-documents-toggle" disabled={mutationPending.current}>
        <Text style={styles.buttonText}>{open ? '応募書類を閉じる' : '応募書類を確認・提出'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.panel}>
          <View style={styles.heading}>
            <Text style={styles.title}>応募書類</Text>
            <Pressable onPress={() => router.push('/(tabs)/profile')} accessibilityRole="button" style={styles.link} disabled={blocked}>
              <Text style={styles.linkText}>書類庫を管理</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => void refresh()} style={styles.button} accessibilityRole="button" disabled={blocked} testID="application-documents-refresh">
            <Text style={styles.buttonText}>最新の応募書類を確認</Text>
          </Pressable>
          {loading ? <Text style={styles.note}>応募書類を読み込んでいます…</Text> : null}
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          {notice ? <Text style={styles.success} accessibilityLiveRegion="polite">{notice}</Text> : null}
          {visibleSnapshot && model ? (
            <>
              {model.missing.length ? (
                <View style={styles.warning}>
                  <Text>応募時に設定されていた書類のうち、{model.missing.length}件がまだ提出されていません。</Text>
                  {model.repairable.length ? (
                    <Pressable style={styles.button} disabled={blocked} onPress={() => void submitDocuments(model.repairable)} testID="application-documents-repair" accessibilityRole="button">
                      <Text style={styles.buttonText}>{pending === 'batch' ? '提出中…' : '未提出の応募時書類をまとめて提出'}</Text>
                    </Pressable>
                  ) : null}
                  {model.unavailableMissingCount ? <Text style={styles.note}>{model.unavailableMissingCount}件は現在の書類庫にありません。現在の書類から提出してください。</Text> : null}
                </View>
              ) : null}
              {visibleSnapshot.saved.length ? visibleSnapshot.saved.map((document) => {
                const attached = model.attachedIds.has(document.id);
                return (
                  <View key={document.id} style={styles.row}>
                    <View style={styles.documentName}>
                      <Text style={styles.label}>{documentTypeLabel(document.document_type)}{document.is_default ? ' ・応募時に使用' : ''}</Text>
                      <Text style={styles.note}>{document.title}</Text>
                    </View>
                    <Pressable style={styles.button} disabled={blocked || attached} onPress={() => void submitDocuments([document])} accessibilityRole="button" testID={'application-document-attach-' + document.id}>
                      <Text style={styles.buttonText}>{attached ? '提出済み' : pending === document.id ? '提出中…' : 'この応募に提出'}</Text>
                    </Pressable>
                  </View>
                );
              }) : <Text style={styles.note}>保存済みの書類はありません。マイページの「応募書類」から書類を保存すると、この応募にも提出できます。</Text>}
              {visibleSnapshot.submitted.length ? (
                <View style={styles.submitted}>
                  <Text style={styles.title}>この応募へ提出済み</Text>
                  {visibleSnapshot.submitted.map((document) => (
                    <View key={document.id} style={styles.row}>
                      <View style={styles.documentName}>
                        <Text style={styles.label}>{documentTypeLabel(document.document_type)}</Text>
                        <Text style={styles.note}>{document.title}</Text>
                      </View>
                      <Pressable style={styles.button} disabled={blocked} onPress={() => void openSubmitted(document)} accessibilityRole="button" testID={'application-document-open-' + document.id}>
                        <Text style={styles.buttonText}>開く</Text>
                      </Pressable>
                    </View>
                  ))}
                  <Text style={styles.note}>提出済みコピーは元の書類を削除しても、この応募の記録として保持されます。</Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  panel: { gap: 12, paddingVertical: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 17, fontWeight: '900', color: '#242c37' },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e8e9ec', gap: 10 },
  documentName: { gap: 4 },
  label: { fontWeight: '800', fontSize: 15, color: '#242c37' },
  note: { fontSize: 13, lineHeight: 20, color: '#576273' },
  button: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e2c9d1', backgroundColor: '#fff', borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontSize: 15, color: '#b71f51', fontWeight: '800' },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { color: '#b71f51', fontWeight: '800' },
  warning: { backgroundColor: '#fff8e6', borderRadius: 12, padding: 12, gap: 8 },
  submitted: { marginTop: 6, gap: 6 },
  error: { color: '#b42318', backgroundColor: '#fff1f0', padding: 10, borderRadius: 9 },
  success: { color: '#067647', backgroundColor: '#e5f7ec', padding: 10, borderRadius: 9 },
});
