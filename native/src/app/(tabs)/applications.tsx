import { useSession } from '@clerk/expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import { listApplications, type JobseekerApplicationSummary } from '../../lib/applicationJourneyApi';
import { usePrivateScreenCapture } from '../../hooks/usePrivateScreenCapture';
import { usePrivateDataQuarantine } from '../../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey, readCandidateOwnedView, readCandidateFreshlyVerifiedView, type CandidateOwnedView } from '../../lib/candidateViewOwner';
import { applicationStatusLabel } from '../../lib/messageInbox';
import { messageNavigationLeaseIsCurrent } from '../../lib/messageNavigationLease';
import { readCandidateApplicationIndex } from '../../lib/candidateApplicationIndexRead';
import { boundedPrivateRead } from '../../lib/privateReadDeadline';
import { canNavigateVerifiedApplicationRow, retainApplicationListForRefresh } from '../../lib/applicationListRefreshPolicy';
import { canStartApplicationIndexRead } from '../../lib/applicationIndexRefreshFlight';
import { canRetainCandidateRowsAfterFailedRead } from '../../lib/candidateVerifiedReadFailure';
import { pinCandidateForRead } from '../../lib/pinnedCandidateRead';
import { createApplicationSecondaryRouteGate } from '../../lib/applicationSecondaryRouteGate';

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('ja-JP');
}

export default function ApplicationsScreen() {
  usePrivateScreenCapture('applications');
  const router = useRouter();
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [ownedApplications, setOwnedApplications] = useState<CandidateOwnedView<JobseekerApplicationSummary[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownedError, setOwnedError] = useState<CandidateOwnedView<string> | null>(null);
  const generation = useRef(0);
  const refreshPending = useRef(false); // synchronous fence before React's loading state renders
  const openRequest = useRef(0);
  const openPending = useRef(false);
  // Separate from row navigation: the visits destination must not race a
  // selected application or survive App Lock, blur or a candidate switch.
  const secondaryRoute = useRef(createApplicationSecondaryRouteGate());
  const [visitsOpening, setVisitsOpening] = useState(false);
  const [ownedVisitsError, setOwnedVisitsError] = useState<CandidateOwnedView<string> | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [ownedOpenError, setOwnedOpenError] = useState<CandidateOwnedView<string> | null>(null);
  const privateAllowed = !privacy.shieldVisible && privacy.canAccessPrivateData();
  const focusedRef = useRef(false);
  const currentOwnerRef = useRef(ownerKey);
  const privateAllowedRef = useRef(privateAllowed);
  currentOwnerRef.current = ownerKey;
  privateAllowedRef.current = privateAllowed;
  // Invalidate synchronously when App Lock/foreground closes. A prior result
  // must not flash on unlock before a new authorized read completes.
  const freshlyVerifiedOwner = useRef<string | null>(null);
  if (!privateAllowed) freshlyVerifiedOwner.current = null;
  const applications = readCandidateFreshlyVerifiedView(ownedApplications, ownerKey, privateAllowed, freshlyVerifiedOwner.current);
  const error = readCandidateOwnedView(ownedError, ownerKey, privateAllowed);
  const openError = readCandidateFreshlyVerifiedView(ownedOpenError, ownerKey, privateAllowed, freshlyVerifiedOwner.current);
  const visitsError = readCandidateOwnedView(ownedVisitsError, ownerKey, privateAllowed);
  const canOpenRows = canNavigateVerifiedApplicationRow({
    ownerKey, freshlyVerifiedOwnerKey: freshlyVerifiedOwner.current,
    hasVisibleRows: applications !== null, privateAllowed,
    navigationPending: openingId !== null || secondaryRoute.current.isPending(),
  });

  const load = useCallback(async (explicitRefresh = false) => {
    if (openPending.current || secondaryRoute.current.isPending()) return; // no refresh during navigation
    if (!canStartApplicationIndexRead({
      pending: refreshPending.current,
      expectedOwnerKey: ownerKey,
      privateAllowed: !privacy.shieldVisible && privacy.canAccessPrivateData(),
    })) return;
    refreshPending.current = true;
    const current = ++generation.current;
    // Web retains confirmed rows during a same-session manual refresh. Never
    // retain across focus, App Lock, or a candidate/session replacement.
    const retainRows = retainApplicationListForRefresh({
      explicitRefresh,
      ownerKey,
      freshlyVerifiedOwnerKey: freshlyVerifiedOwner.current,
      privateAllowed: !privacy.shieldVisible && privacy.canAccessPrivateData(),
    });
    if (!retainRows) freshlyVerifiedOwner.current = null;
    openRequest.current += 1;
    openPending.current = false;
    setOpeningId(null);
    setOwnedOpenError(null);
    setLoading(true);
    if (!retainRows) setOwnedApplications(null);
    setOwnedError(null);
    const verifiedPin = { current: null as { ownerId: string; ownerSessionId: string; isCurrent: () => boolean } | null };
    try {
      const verified = await readCandidateApplicationIndex({
        pin: pinCandidateAction,
        list: listApplications,
        onVerifiedPin: (pin) => { verifiedPin.current = pin; },
        expectedOwnerKey: ownerKey,
        resolveOwnerKey: candidateViewOwnerKey,
        isActive: () => current === generation.current &&
          !privacy.shieldVisible && privacy.canAccessPrivateData(),
      });
      if (current !== generation.current || privacy.shieldVisible ||
          !privacy.canAccessPrivateData()) return;
      const verifiedOwner = verified.ownerKey;
      freshlyVerifiedOwner.current = verifiedOwner;
      setOwnedApplications({ ownerKey: verifiedOwner, value: verified.rows });
    } catch {
      if (current === generation.current) {
        // A failed Clerk pin is NOT proof that previously retained private
        // rows still belong to an authorized active session.
        const retainAfterFailure = canRetainCandidateRowsAfterFailedRead({
          retainedAtStart: retainRows,
          expectedOwnerKey: ownerKey,
          pinnedOwnerKey: verifiedPin.current
            ? candidateViewOwnerKey(verifiedPin.current.ownerId, verifiedPin.current.ownerSessionId) : null,
          pinnedSessionCurrent: verifiedPin.current?.isCurrent() === true,
          privateAllowed: !privacy.shieldVisible && privacy.canAccessPrivateData(),
        });
        if (!retainAfterFailure) {
          freshlyVerifiedOwner.current = null;
          setOwnedApplications(null);
        }
        if (ownerKey && !privacy.shieldVisible && privacy.canAccessPrivateData()) {
          setOwnedError({ ownerKey, value: '応募情報を取得できませんでした。通信状態を確認して再読み込みしてください。' });
        }
      }
    } finally {
      if (current === generation.current) {
        refreshPending.current = false;
        setLoading(false);
      }
    }
  }, [ownerKey, pinCandidateAction, privacy.canAccessPrivateData, privacy.shieldVisible]);

  // A return from details/interview/application submission must read the
  // canonical status anew. Blur revokes the lease and invalidates in-flight RPCs.
  useFocusEffect(useCallback(() => {
    focusedRef.current = !!ownerKey && privateAllowed;
    secondaryRoute.current.invalidate();
    setVisitsOpening(false);
    setOwnedVisitsError(null);
    if (!ownerKey || !privateAllowed) {
      generation.current += 1;
      refreshPending.current = false;
      freshlyVerifiedOwner.current = null;
      openRequest.current += 1;
      openPending.current = false;
      setOpeningId(null);
      setOwnedOpenError(null);
      setOwnedApplications(null);
      setOwnedError(null);
      setLoading(true);
      return;
    }
    void load();
    return () => {
      focusedRef.current = false;
      secondaryRoute.current.invalidate();
      setVisitsOpening(false);
      setOwnedVisitsError(null);
      generation.current += 1;
      refreshPending.current = false;
      freshlyVerifiedOwner.current = null;
      openRequest.current += 1;
      openPending.current = false;
      setOpeningId(null);
      setOwnedOpenError(null);
    };
  }, [ownerKey, privateAllowed, load]));

  const openApplication = async (applicationId: string) => {
    if (secondaryRoute.current.isPending()) return;
    // A session pin can outlive a tap, blur, App Lock or account replacement.
    // Claim the navigation synchronously to prevent duplicate stack pushes.
    if (!canNavigateVerifiedApplicationRow({
      ownerKey, freshlyVerifiedOwnerKey: freshlyVerifiedOwner.current,
      hasVisibleRows: applications !== null,
      privateAllowed: !privacy.shieldVisible && privacy.canAccessPrivateData(),
      navigationPending: openPending.current,
    })) return;
    const startedGeneration = generation.current;
    const expectedOwnerKey = ownerKey;
    const authorizedApplicationIds = applications?.map((application) => application.id) ?? [];
    const leaseIsCurrent = (resolvedOwnerKey: string | null) => messageNavigationLeaseIsCurrent({
      applicationId,
      authorizedApplicationIds,
      expectedOwnerKey,
      resolvedOwnerKey,
      freshlyVerifiedOwnerKey: freshlyVerifiedOwner.current,
      startedGeneration,
      currentGeneration: generation.current,
      privateDataAllowed: !privacy.shieldVisible && privacy.canAccessPrivateData(),
    });
    if (!applications || !leaseIsCurrent(expectedOwnerKey)) return;
    openPending.current = true;
    const request = ++openRequest.current;
    setOpeningId(applicationId);
    setOwnedOpenError(null);
    let navigationStarted = false;
    try {
      const pinned = await boundedPrivateRead(() => pinCandidateAction());
      if (request !== openRequest.current || !pinned?.isCurrent() ||
          !leaseIsCurrent(candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId))) return;
      router.push(`/application/${applicationId}` as never);
      navigationStarted = true;
    } catch {
      if (request === openRequest.current && leaseIsCurrent(expectedOwnerKey)) {
        setOwnedOpenError({ ownerKey: expectedOwnerKey!, value: '応募詳細を開けませんでした。通信状態を確認してもう一度お試しください。' });
      }
    } finally {
      // After successful navigation, hold the lock until blur invalidates it.
      if (!navigationStarted && request === openRequest.current) {
        openPending.current = false;
        setOpeningId(null);
      }
    }
  };

  // Web /applications exposes 見学・体験 independently of whether the
  // application index loaded. It must not bypass the current Clerk session
  // or race the pending application-detail push.
  const openVisits = async () => {
    const expectedOwnerKey = ownerKey;
    if (!expectedOwnerKey || !focusedRef.current || !privateAllowedRef.current ||
        openPending.current || secondaryRoute.current.isPending()) return;
    setVisitsOpening(true);
    setOwnedVisitsError(null);
    const result = await secondaryRoute.current.navigate({
      expectedOwnerKey,
      currentOwnerKey: () => currentOwnerRef.current,
      canNavigate: () => focusedRef.current && privateAllowedRef.current &&
        !openPending.current && privacy.canAccessPrivateData(),
      resolveOwnerKey: candidateViewOwnerKey,
      pin: (isCurrent) => pinCandidateForRead(pinCandidateAction, isCurrent),
      navigate: () => router.push('/visits' as never),
    });
    if (result !== 'opened' && !secondaryRoute.current.isPending()) {
      setVisitsOpening(false);
      if (result === 'failed' && currentOwnerRef.current === expectedOwnerKey &&
          focusedRef.current && privateAllowedRef.current) {
        setOwnedVisitsError({ ownerKey: expectedOwnerKey,
          value: '見学・体験の予定を開けませんでした。通信状態を確認してもう一度お試しください。' });
      }
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.heading}>
        <Pressable style={styles.refresh} onPress={() => void load(true)} disabled={loading || openingId !== null}
          accessibilityRole="button" accessibilityLabel="応募管理の一覧を更新"
          accessibilityState={{ disabled: loading || openingId !== null }}>
          <Text style={styles.refreshText}>更新</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
          <Pressable style={styles.retry} accessibilityRole="button" onPress={() => void load(true)} disabled={loading}>
            <Text style={styles.retryText}>再読み込み</Text>
          </Pressable>
        </View>
      ) : null}
      {error && applications?.length ? (
        <Text style={styles.staleNotice} accessibilityLiveRegion="polite">
          前回確認できた応募一覧を表示しています。選考状況は更新されていない場合があります。
        </Text>
      ) : null}
      {openError ? <Text style={styles.error} accessibilityLiveRegion="polite">{openError}</Text> : null}
      {(loading || (applications === null && !error)) ? <ActivityIndicator /> : null}
      {!loading && !error && applications?.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>応募はまだありません</Text>
          <Text style={styles.subtle}>気になる園を見つけたら、求人から応募できます。</Text>
          <Pressable style={styles.primary} onPress={() => router.push('/(tabs)/jobs')}>
            <Text style={styles.primaryText}>求人を探す</Text>
          </Pressable>
        </View>
      ) : null}

      {(applications ?? []).map((application) => (
        <Pressable
          key={application.id}
          style={styles.card}
          onPress={() => void openApplication(application.id)}
          disabled={!canOpenRows}
          accessibilityState={{ disabled: !canOpenRows }}
          accessibilityRole="button"
          accessibilityLabel={`${application.facility_name} ${application.job_title}の応募詳細を開く`}
        >
          <View style={styles.cardRow}>
            <View style={styles.cardContent}>
              <Text style={styles.status}>{applicationStatusLabel(application.status)}</Text>
              <Text style={styles.facility}>{application.facility_name || '園'}</Text>
              <Text style={styles.jobTitle}>{application.job_title || '求人'}</Text>
              <Text style={styles.meta}>応募日 {formatDate(application.applied_at)}</Text>
              {openingId === application.id ? (
                <Text style={styles.open} accessibilityLiveRegion="polite">詳細を開いています…</Text>
              ) : null}
            </View>
            <Text style={styles.chevron} importantForAccessibility="no" accessibilityElementsHidden>›</Text>
          </View>
        </Pressable>
      ))}

      {visitsError ? <Text style={styles.error} accessibilityLiveRegion="polite">{visitsError}</Text> : null}
      <Pressable style={styles.secondary}
        disabled={openingId !== null || visitsOpening || !privateAllowed}
        accessibilityRole="button"
        accessibilityLabel="見学・体験の予定を見る"
        accessibilityState={{ disabled: openingId !== null || visitsOpening || !privateAllowed }}
        onPress={() => void openVisits()}>
        <Text style={styles.secondaryText}>{visitsOpening ? '見学・体験の予定を開いています…' : '見学・体験の予定を見る'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10, backgroundColor: '#FBF7F6', flexGrow: 1 },
  heading: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  refresh: { minHeight: 48, borderWidth: 1, borderColor: '#ECE6E4', borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: '#fff' },
  refreshText: { color: '#1E2A3B', fontSize: 15, fontWeight: '800' },
  subtle: { color: '#4A5566', fontSize: 15, lineHeight: 24 },
  errorCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#F3C9D1', padding: 12, borderRadius: 14, backgroundColor: '#fff' },
  error: { flexGrow: 1, flexShrink: 1, minWidth: 160, color: '#9D3449', fontSize: 15, lineHeight: 23 },
  staleNotice: { color: '#6A4D53', fontSize: 14, lineHeight: 22 },
  retry: { minHeight: 48, minWidth: 104, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E72346', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#C8173A', fontSize: 15, fontWeight: '800' },
  empty: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ECE6E4', borderRadius: 18, padding: 24, gap: 14 },
  emptyTitle: { fontSize: 18, color: '#1E2A3B', fontWeight: '800' },
  primary: { minHeight: 56, borderRadius: 12, backgroundColor: '#E72346', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  card: { minHeight: 72, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ECE6E4', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardContent: { flex: 1, gap: 3, minWidth: 0 },
  status: { alignSelf: 'flex-start', minHeight: 24, textAlignVertical: 'center', fontSize: 14, fontWeight: '800', color: '#C8173A', backgroundColor: '#FFF0F3', paddingHorizontal: 10, borderRadius: 12, overflow: 'hidden' },
  facility: { fontSize: 17, fontWeight: '800', color: '#1E2A3B' },
  jobTitle: { fontSize: 15, lineHeight: 22, color: '#4A5566' },
  meta: { fontSize: 14, color: '#5F6977' },
  chevron: { fontSize: 26, color: '#5F6977', paddingHorizontal: 3 },
  open: { marginTop: 4, fontSize: 14, fontWeight: '800', color: '#C8173A' },
  secondary: { minHeight: 48, borderWidth: 1, borderColor: '#ECE6E4', borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#C8173A', fontSize: 15, fontWeight: '800' },
});
