import { useSession } from '@clerk/expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import { listApplications, type JobseekerApplicationSummary } from '../../lib/applicationJourneyApi';
import { usePrivateScreenCapture } from '../../hooks/usePrivateScreenCapture';
import { usePrivateDataQuarantine } from '../../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey, readCandidateFreshlyVerifiedView, type CandidateOwnedView } from '../../lib/candidateViewOwner';
import { applicationStatusLabel } from '../../lib/messageInbox';
import { messageNavigationLeaseIsCurrent } from '../../lib/messageNavigationLease';
import { readCandidateApplicationIndex } from '../../lib/candidateApplicationIndexRead';
import { boundedPrivateRead } from '../../lib/privateReadDeadline';

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
  const openRequest = useRef(0);
  const openPending = useRef(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [ownedOpenError, setOwnedOpenError] = useState<CandidateOwnedView<string> | null>(null);
  const privateAllowed = !privacy.shieldVisible && privacy.canAccessPrivateData();
  // Invalidate synchronously when App Lock/foreground closes. A prior result
  // must not flash on unlock before a new authorized read completes.
  const freshlyVerifiedOwner = useRef<string | null>(null);
  if (!privateAllowed) freshlyVerifiedOwner.current = null;
  const applications = readCandidateFreshlyVerifiedView(ownedApplications, ownerKey, privateAllowed, freshlyVerifiedOwner.current);
  const error = readCandidateFreshlyVerifiedView(ownedError, ownerKey, privateAllowed, freshlyVerifiedOwner.current);
  const openError = readCandidateFreshlyVerifiedView(ownedOpenError, ownerKey, privateAllowed, freshlyVerifiedOwner.current);

  const load = useCallback(async () => {
    const current = ++generation.current;
    freshlyVerifiedOwner.current = null;
    openRequest.current += 1;
    openPending.current = false;
    setOpeningId(null);
    setOwnedOpenError(null);
    setLoading(true);
    setOwnedApplications(null);
    setOwnedError(null);
    try {
      const verified = await readCandidateApplicationIndex({
        pin: pinCandidateAction,
        list: listApplications,
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
        if (ownerKey && privacy.canAccessPrivateData()) {
          freshlyVerifiedOwner.current = ownerKey;
          setOwnedError({ ownerKey, value: '応募情報を取得できませんでした。通信状態を確認して再読み込みしてください。' });
        }
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [ownerKey, pinCandidateAction, privacy.canAccessPrivateData]);

  // A return from details/interview/application submission must read the
  // canonical status anew. Blur revokes the lease and invalidates in-flight RPCs.
  useFocusEffect(useCallback(() => {
    if (!ownerKey || !privateAllowed) {
      generation.current += 1;
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
      generation.current += 1;
      freshlyVerifiedOwner.current = null;
      openRequest.current += 1;
      openPending.current = false;
      setOpeningId(null);
      setOwnedOpenError(null);
    };
  }, [ownerKey, privateAllowed, load]));

  const openApplication = async (applicationId: string) => {
    // A session pin can outlive a tap, blur, App Lock or account replacement.
    // Claim the navigation synchronously to prevent duplicate stack pushes.
    if (openPending.current || loading) return;
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

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.heading}>
        <Pressable style={styles.refresh} onPress={() => void load()} disabled={loading || openingId !== null}
          accessibilityRole="button" accessibilityLabel="応募管理の一覧を更新"
          accessibilityState={{ disabled: loading || openingId !== null }}>
          <Text style={styles.refreshText}>更新</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
          <Pressable style={styles.retry} accessibilityRole="button" onPress={() => void load()} disabled={loading}>
            <Text style={styles.retryText}>再読み込み</Text>
          </Pressable>
        </View>
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
          disabled={loading || openingId !== null}
          accessibilityState={{ disabled: loading || openingId !== null }}
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

      <Pressable style={styles.secondary} disabled={openingId !== null} onPress={() => router.push('/visits' as never)}>
        <Text style={styles.secondaryText}>見学・体験の予定を見る</Text>
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
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#F3C9D1', padding: 12, borderRadius: 14, backgroundColor: '#fff' },
  error: { flex: 1, color: '#9D3449', fontSize: 15, lineHeight: 23 },
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
