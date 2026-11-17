import { useSession } from '@clerk/expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { usePrivateDataQuarantine } from '../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey, candidateApplicationViewOwnerKey, readCandidateFreshlyVerifiedView, type CandidateOwnedView } from '../lib/candidateViewOwner';
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
import { pinCandidateForRead } from '../lib/pinnedCandidateRead';
import { pinForApplicationMutation } from '../lib/applicationMutationPin';
import { awaitApplicationDocumentAttachmentAck } from '../lib/awaitApplicationDocumentAttachmentAck';
import { applicationDocumentActionAccessibilityLabel } from '../lib/applicationDocumentActionAccessibilityLabel';
import { openCandidateApplicationDocument } from '../lib/openCandidateApplicationDocument';
import { shouldRefreshOpenedApplicationDocuments } from '../lib/manualApplicationConversationRefresh';
import { presentApplicationDocumentError } from '../lib/applicationDocumentErrorPresentation';
import { readApplicationDocumentSnapshot } from '../lib/applicationDocumentSnapshotRead';
import { hasCanonicalApplicationAttachment, projectApplicationDocuments } from '../lib/applicationDocumentsPresentation';
import { canStartFocusedApplicationDocumentsRefresh, canApplyFocusedApplicationDocumentsRefresh, canPublishApplicationDocumentHandoff, canOpenAttachedApplicationDocumentUrl, shouldRevokeDocumentReadOnBlur } from '../lib/focusedApplicationDocumentsRefresh';

type DocumentSnapshot = {
  saved: JobseekerDocument[];
  submitted: AttachedApplicationDocument[];
  expectations: ApplicationDocumentExpectation[];
};

/** Actual Web ApplicationMessages document flows; all reads/writes use the pinned candidate session. */
export function ApplicationDocumentsSection({
  applicationId,
  manualRefreshRequest = 0,
  onHandoffReadback,
}: {
  applicationId: string;
  manualRefreshRequest?: number;
  onHandoffReadback: (value: ApplicationDocumentHandoffState | null) => void;
}) {
  const { pinCandidateAction } = usePinnedCandidateAction();
  const router = useRouter();
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const viewKey = candidateApplicationViewOwnerKey(ownerKey, applicationId);
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
  const readPending = useRef(false);
  const lastConsumedManualRefreshRequest = useRef(0);
  const focusedRef = useRef(false);
  const presentationEpoch = useRef(0);
  const freshlyVerifiedOwner = useRef<string | null>(null);
  const contextLease = useRef({ viewKey, shieldVisible: privacy.shieldVisible });
  if (!canReadPrivate) freshlyVerifiedOwner.current = null;
  const contextCurrent = contextLease.current.viewKey === viewKey &&
    contextLease.current.shieldVisible === privacy.shieldVisible;
  const visibleSnapshot = readCandidateFreshlyVerifiedView(
    snapshot, viewKey, canReadPrivate && contextCurrent, freshlyVerifiedOwner.current);

  useEffect(() => {
    // React StrictMode can replay mount effects; reset the private-view lease.
    alive.current = true;
    return () => {
      alive.current = false;
      requestVersion.current += 1;
      readPending.current = false;
    };
  }, []);

  useEffect(() => {
    // The document panel is private even while its parent screen remains mounted.
    // A Clerk account/session switch or App Lock revokes its presentation lease.
    if (contextLease.current.viewKey === viewKey &&
        contextLease.current.shieldVisible === privacy.shieldVisible) return;
    contextLease.current = { viewKey, shieldVisible: privacy.shieldVisible };
    requestVersion.current += 1;
    readPending.current = false;
    // Revoke the previous route/session's pending UI lock even if its
    // network operation never settles; the version check fences later writes.
    mutationPending.current = false;
    freshlyVerifiedOwner.current = null;
    setPending(null);
    setSnapshot(null);
    setOpen(false);
    setLoading(false);
    setError(null);
    setNotice(null);
  }, [viewKey, privacy.shieldVisible]);

  const refresh = async (quiet = false) => {
    const refreshState = () => ({
      open,
      focused: focusedRef.current,
      foreground: AppState.currentState === 'active',
      privateAccess: privacy.canAccessPrivateData() && !contextLease.current.shieldVisible,
      ownerCurrent: Boolean(viewKey && ownerKey && contextLease.current.viewKey === viewKey),
      mutationPending: mutationPending.current,
    });
    if (quiet && !canStartFocusedApplicationDocumentsRefresh(refreshState(), readPending.current)) return;
    if (readPending.current || mutationPending.current || !ownerKey || !viewKey || !canReadPrivate || !contextCurrent) return;
    readPending.current = true;
    const requestedOwnerKey = ownerKey;
    const requestedViewKey = viewKey;
    const version = ++requestVersion.current;
    // Keep canonical rows visible during silent Web-parity refresh, but
    // block any document action until freshness is confirmed.
    if (!quiet) {
      freshlyVerifiedOwner.current = null;
      setSnapshot(null);
      setNotice(null);
    }
    setLoading(true);
    setError(null);
    try {
      // A hung Clerk token must not leave the three-source document panel
      // spinning indefinitely. Never start private RPCs after a stale refresh.
      const pinned = await pinCandidateForRead(pinCandidateAction, () =>
        alive.current && version === requestVersion.current && focusedRef.current &&
        privacy.canAccessPrivateData() && !privacy.shieldVisible &&
        contextLease.current.viewKey === requestedViewKey);
      if (!pinned.isCurrent() ||
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
          privacy.canAccessPrivateData() && contextLease.current.viewKey === requestedViewKey &&
          (!quiet || canApplyFocusedApplicationDocumentsRefresh(refreshState())),
      });
      projectApplicationDocuments(applicationId, saved, submitted, expectations);
      if (!alive.current || !pinned.isCurrent() || !privacy.canAccessPrivateData() ||
          version !== requestVersion.current ||
          (quiet && !canApplyFocusedApplicationDocumentsRefresh(refreshState()))) return;
      freshlyVerifiedOwner.current = requestedViewKey;
      setSnapshot({ ownerKey: requestedViewKey, value: { saved, submitted, expectations } });
    } catch (caught) {
      if (alive.current && version === requestVersion.current) {
        setError(presentApplicationDocumentError('refresh', caught));
      }
    } finally {
      if (version === requestVersion.current) {
        readPending.current = false;
        if (alive.current) setLoading(false);
      }
    }
  };

  // The same Web 更新 button reloads messages and documents. Consume each
  // parent command once, including skipped commands while this panel is
  // closed or busy. Opening the panel later uses its own canonical refresh.
  useEffect(() => {
    if (manualRefreshRequest <= lastConsumedManualRefreshRequest.current) return;
    const previousRequest = lastConsumedManualRefreshRequest.current;
    lastConsumedManualRefreshRequest.current = manualRefreshRequest;
    if (!shouldRefreshOpenedApplicationDocuments(manualRefreshRequest, previousRequest, {
      open,
      focused: focusedRef.current,
      foreground: AppState.currentState === 'active',
      privateAccess: canReadPrivate && privacy.canAccessPrivateData() && !contextLease.current.shieldVisible,
      ownerCurrent: Boolean(ownerKey && viewKey && contextLease.current.viewKey === viewKey),
      mutationPending: mutationPending.current,
    }, readPending.current)) return;
    void refresh();
  }, [manualRefreshRequest]);

  // An open Web panel updates saved, submitted and expected documents every
  // 60 seconds and when visibility returns. Never poll a closed/private panel.
  const quietRefreshRef = useRef<() => void>(() => undefined);
  quietRefreshRef.current = () => { void refresh(true); };
  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    return () => {
      focusedRef.current = false;
      ++presentationEpoch.current;
      // A started document submission must keep its duplicate-write lease
      // until settlement; only ordinary reads can be invalidated on blur.
      if (shouldRevokeDocumentReadOnBlur(mutationPending.current)) ++requestVersion.current;
      readPending.current = false;
      freshlyVerifiedOwner.current = null;
      setSnapshot(null);
      setOpen(false);
      setLoading(false);
      setError(null);
      setNotice(null);
    };
  }, []));
  useFocusEffect(useCallback(() => {
    if (!open) return;
    const timer = setInterval(() => quietRefreshRef.current(), 60_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') ++presentationEpoch.current;
      if (state === 'active') quietRefreshRef.current();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [open]));

  const toggle = () => {
    if (mutationPending.current || !canReadPrivate || !ownerKey || !viewKey || !contextCurrent) return;
    if (open) {
      ++requestVersion.current;
      readPending.current = false;
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
    if (!open || !visibleSnapshot || !ownerKey || !viewKey || !canReadPrivate || !targets.length || mutationPending.current || readPending.current || loading || error !== null) return;
    const model = projectApplicationDocuments(applicationId, visibleSnapshot.saved, visibleSnapshot.submitted, visibleSnapshot.expectations);
    if (targets.some((document) => !visibleSnapshot.saved.some((row) => row.id === document.id)
      || model.attachedIds.has(document.id))) return;
    const uniqueTargets = [...new Map(targets.map((document) => [document.id, document])).values()];
    const requestedOwnerKey = ownerKey;
    const requestedViewKey = viewKey;
    const requestedPresentationEpoch = presentationEpoch.current;
    mutationPending.current = true;
    const version = ++requestVersion.current;
    setPending(uniqueTargets.length > 1 ? 'batch' : uniqueTargets[0].id);
    setError(null);
    setNotice(null);
    // The token request is only preparation. Nothing has reached the
    // attachment RPC yet, so a token timeout is not an ambiguous submission.
    let submissionStarted = false;
    try {
      const prewriteCurrent = () => alive.current && version === requestVersion.current &&
        mutationPending.current && open && focusedRef.current &&
        AppState.currentState === 'active' && privacy.canAccessPrivateData() &&
        !privacy.shieldVisible && !contextLease.current.shieldVisible &&
        contextLease.current.viewKey === requestedViewKey && viewKey === requestedViewKey &&
        presentationEpoch.current === requestedPresentationEpoch;
      const pinned = await pinForApplicationMutation(pinCandidateAction, prewriteCurrent);
      if (candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== requestedOwnerKey) {
        throw new Error('安全なログイン状態を確認できませんでした。');
      }
      const canPublishHandoff = () => canPublishApplicationDocumentHandoff({
        open,
        focused: focusedRef.current,
        foreground: AppState.currentState === 'active',
        privateAccess: privacy.canAccessPrivateData() && !privacy.shieldVisible && !contextLease.current.shieldVisible,
        ownerCurrent: contextLease.current.viewKey === requestedViewKey && viewKey === requestedViewKey,
        mutationPending: mutationPending.current,
        presentationUnchanged: presentationEpoch.current === requestedPresentationEpoch,
      }, alive.current && pinned.isCurrent() && version === requestVersion.current);
      // Stop the batch on the first missing/late acknowledgement. Continuing
      // would begin more private writes after an unknown server outcome.
      // The adapter checks this deadline lease before every new write stage.
      for (const document of uniqueTargets) {
        if (!canPublishHandoff()) return;
        await awaitApplicationDocumentAttachmentAck(async (canContinue) => {
          if (!canContinue()) throw new Error('応募書類の操作画面が変更されました。');
          // Conservative boundary: even a Storage preflight may have started,
          // so a missing reply cannot be labelled "not submitted".
          submissionStarted = true;
          await attachJobseekerDocumentToApplication(
            pinned.client, document, applicationId, { canContinue },
          );
        }, canPublishHandoff);
      }
      if (!canPublishHandoff()) return; // Never read back a blurred or refocused batch.
      const { saved, submitted, expectations } = await readApplicationDocumentSnapshot({
        ownerId: pinned.ownerId,
        applicationId,
        loadSaved: () => listJobseekerDocuments(pinned.client),
        loadSubmitted: () => listSubmittedApplicationDocuments(pinned.client, applicationId),
        loadExpectations: () => listApplicationDocumentExpectations(pinned.client, applicationId),
        isCurrent: canPublishHandoff,
      });
      projectApplicationDocuments(applicationId, saved, submitted, expectations);
      if (!canPublishHandoff()) return;
      freshlyVerifiedOwner.current = requestedViewKey;
      setSnapshot({ ownerKey: requestedViewKey, value: { saved, submitted, expectations } });
      const confirmed = uniqueTargets.filter((document) =>
        hasCanonicalApplicationAttachment(applicationId, document.id, submitted));
      if (confirmed.length === uniqueTargets.length) {
        setNotice(uniqueTargets.length > 1
          ? '未提出書類' + confirmed.length + '件をこの応募へ提出しました。'
          : documentTypeLabel(uniqueTargets[0].document_type) + 'をこの応募先へ提出しました。');
      } else {
        setError('応募書類' + uniqueTargets.length + '件のうち' + (uniqueTargets.length - confirmed.length) + '件の提出を確認できませんでした。最新の提出状況を確認してください。');
      }
      if (!canPublishHandoff()) return;
      try {
        const handoff = await boundedPrivateRead(() => {
          if (!canPublishHandoff()) throw new Error('閲覧状態が変わったため確認を中止しました。');
          return getApplicationDocumentHandoffState(pinned.client, applicationId);
        });
        if (canPublishHandoff()) onHandoffReadback(handoff);
      } catch {
        if (canPublishHandoff()) onHandoffReadback(null);
      }
    } catch {
      if (alive.current && version === requestVersion.current) {
        if (submissionStarted) {
          // A started write may still commit. Discard old rows and prohibit
          // a repeat until a fresh canonical document read succeeds.
          setSnapshot(null);
          setError('提出結果を確認できませんでした。重複を防ぐため応募書類を再読み込みしてください。');
        } else {
          // No attachment RPC was invoked: preserve confirmed read-only rows
          // but require a fresh session/read before enabling any submission.
          setError('ログイン状態を確認できませんでした。書類は提出していません。最新の状態を確認してから再度お試しください。');
        }
      }
    } finally {
      // Never let a stale operation release the newer route's mutation lock.
      if (version === requestVersion.current) {
        mutationPending.current = false;
        if (alive.current) setPending(null);
      }
    }
  };

  const openSubmitted = async (document: AttachedApplicationDocument) => {
    if (!visibleSnapshot || !canReadPrivate || !ownerKey || !viewKey || !open || mutationPending.current || readPending.current || loading || error !== null ||
      !visibleSnapshot.submitted.some((row) => row.id === document.id && row.application_id === applicationId)) return;
    mutationPending.current = true;
    const version = ++requestVersion.current;
    const requestedOwnerKey = ownerKey;
    const requestedViewKey = viewKey;
    const requestedPresentationEpoch = presentationEpoch.current;
    const canUseSignedUrl = () => canOpenAttachedApplicationDocumentUrl({
      open,
      focused: focusedRef.current,
      foreground: AppState.currentState === 'active',
      privateAccess: privacy.canAccessPrivateData() && !privacy.shieldVisible && !contextLease.current.shieldVisible,
      ownerCurrent: contextLease.current.viewKey === requestedViewKey && viewKey === requestedViewKey,
      mutationPending: mutationPending.current,
      presentationUnchanged: presentationEpoch.current === requestedPresentationEpoch,
    }, alive.current && version === requestVersion.current);
    setPending('open-' + document.id);
    setError(null);
    try {
      // Both the token and signed URL are private reads. Bound them separately,
      // and never launch an OS viewer from a stale session, App Lock or blur.
      await openCandidateApplicationDocument({
        pin: async () => {
          const pinned = await pinCandidateAction();
          if (!pinned ||
              candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== requestedOwnerKey) {
            throw new Error('安全なログイン状態を確認できませんでした。');
          }
          return pinned;
        },
        getSignedUrl: (client) => createAttachedApplicationDocumentSignedUrl(client, document),
        openUrl: (url) => Linking.openURL(url),
        isCurrent: canUseSignedUrl,
      });
    } catch (caught) {
      if (canUseSignedUrl()) {
        setError(presentApplicationDocumentError('open', caught));
      }
    } finally {
      // Never let a stale operation release the newer route's mutation lock.
      if (version === requestVersion.current) {
        mutationPending.current = false;
        if (alive.current) setPending(null);
      }
    }
  };

  const model = visibleSnapshot ? projectApplicationDocuments(applicationId, visibleSnapshot.saved, visibleSnapshot.submitted, visibleSnapshot.expectations) : null;
  const blocked = loading || pending !== null || mutationPending.current || readPending.current || !canReadPrivate || !contextCurrent;
  // A failed quiet read preserves the last confirmed rows for reference,
  // not authorization to attach/open a possibly stale document.
  const writesBlocked = blocked || error !== null;
  if (!canReadPrivate || !ownerKey || !viewKey || !contextCurrent) {
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
                  <Text>応募した時点で「応募時に使用」に設定されていた書類のうち、{model.missing.length}件がこの応募にはまだ提出されていません。</Text>
                  {model.repairable.length ? (
                    <Pressable style={styles.button} disabled={writesBlocked} onPress={() => void submitDocuments(model.repairable)} testID="application-documents-repair" accessibilityRole="button">
                      <Text style={styles.buttonText}>{pending === 'batch' ? '提出中…' : '未提出の応募時書類をまとめて提出'}</Text>
                    </Pressable>
                  ) : null}
                  {model.unavailableMissingCount ? <Text style={styles.note}>応募時に選ばれていた書類のうち{model.unavailableMissingCount}件は現在の書類庫にありません。必要な場合は、下の現在の書類をこの応募へ提出してください。</Text> : null}
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
                    <Pressable style={styles.button} disabled={writesBlocked || attached} onPress={() => void submitDocuments([document])} accessibilityRole="button" accessibilityLabel={applicationDocumentActionAccessibilityLabel(attached ? 'submitted' : 'submit', documentTypeLabel(document.document_type), document.title)} testID={'application-document-attach-' + document.id}>
                      <Text style={styles.buttonText}>{attached ? '提出済み' : pending === document.id ? '提出中…' : 'この応募に提出'}</Text>
                    </Pressable>
                  </View>
                );
              }) : <Text style={styles.note}>保存済みの書類はありません。マイページの「応募書類」から履歴書や保育士証を一度保存すると、次の応募でも再利用できます。</Text>}
              {visibleSnapshot.submitted.length ? (
                <View style={styles.submitted}>
                  <Text style={styles.title}>この応募へ提出済み</Text>
                  {visibleSnapshot.submitted.map((document) => (
                    <View key={document.id} style={styles.row}>
                      <View style={styles.documentName}>
                        <Text style={styles.label}>{documentTypeLabel(document.document_type)}</Text>
                        <Text style={styles.note}>{document.title}</Text>
                      </View>
                      <Pressable style={styles.button} disabled={writesBlocked} onPress={() => void openSubmitted(document)} accessibilityRole="button" accessibilityLabel={applicationDocumentActionAccessibilityLabel('open', documentTypeLabel(document.document_type), document.title)} testID={'application-document-open-' + document.id}>
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
