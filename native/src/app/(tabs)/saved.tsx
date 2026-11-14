import { SavedJobPreviewCard } from '../../components/SavedJobPreviewCard';
import { savedJobNavigationPath, type SavedJobDestination } from '../../lib/savedJobNavigation';
import { usePrivateScreenCapture } from '../../hooks/usePrivateScreenCapture';
import { useSession } from '@clerk/expo';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import { listSavedJobs, unsaveJob, type SavedJobseekerJob } from '../../lib/jobseekerCoreApi';
import { canCommitSavedJobsView, removeSavedJobAndConfirm } from '../../lib/savedJobsReadback';
import { boundedPrivateRead } from '../../lib/privateReadDeadline';
import { readCandidateJobDiscoveryBounded } from '../../lib/jobDiscoveryCanonicalRead';
import { canActOnSavedJobs, canStartSavedJobsRefresh, retainSavedJobsDuringManualRefresh } from '../../lib/savedJobsRefreshPolicy';
import { usePrivateDataQuarantine } from '../../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey, readCandidateFreshlyVerifiedView, readCandidateOwnedView, type CandidateOwnedView } from '../../lib/candidateViewOwner';

export default function SavedJobsScreen() {
  usePrivateScreenCapture('saved');
  const router = useRouter();
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [ownedJobs, setOwnedJobs] = useState<CandidateOwnedView<SavedJobseekerJob[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ownedError, setOwnedError] = useState<CandidateOwnedView<string> | null>(null);
  const generation = useRef(0);
  const refreshSequence = useRef(0);
  const refreshPendingRef = useRef(false);
  const freshlyVerifiedOwner = useRef<string | null>(null);
  const mutationBusyRef = useRef(false);
  const mutationSequence = useRef(0);
  const focusedOwnerRef = useRef<string | null>(null);
  const focusActiveRef = useRef(false);
  const currentOwnerRef = useRef(ownerKey);
  const privateVisible = Boolean(ownerKey) && !privacy.shieldVisible && privacy.canAccessPrivateData();
  const privateVisibleRef = useRef(privateVisible);
  currentOwnerRef.current = ownerKey;
  privateVisibleRef.current = privateVisible;
  if (!privateVisible) freshlyVerifiedOwner.current = null;

  const jobs = readCandidateFreshlyVerifiedView(ownedJobs, ownerKey, privateVisible, freshlyVerifiedOwner.current);
  const error = readCandidateOwnedView(ownedError, ownerKey, privateVisible);
  const canAct = canActOnSavedJobs({
    hasVerifiedRows: jobs !== null,
    loading,
    readFailed: Boolean(error),
    privateAllowed: privateVisible,
    focusActive: focusActiveRef.current,
    mutationPending: mutationBusyRef.current,
  });
  const canPresent = (requestOwner: string | null, requestGeneration: number) =>
    canCommitSavedJobsView(requestOwner, currentOwnerRef.current, requestGeneration,
      generation.current, privateVisibleRef.current);

  const load = useCallback(async (manual = false) => {
    const requestOwner = ownerKey;
    if (!canStartSavedJobsRefresh({
      refreshPending: refreshPendingRef.current,
      mutationPending: mutationBusyRef.current,
      privateAllowed: privateVisibleRef.current,
      focusActive: focusActiveRef.current,
      ownerKey: requestOwner,
    })) return;
    refreshPendingRef.current = true;
    const refreshId = ++refreshSequence.current;
    const requestGeneration = ++generation.current;
    const retainRows = retainSavedJobsDuringManualRefresh({
      manual,
      ownerKey: requestOwner,
      verifiedOwnerKey: freshlyVerifiedOwner.current,
      privateAllowed: privateVisibleRef.current,
      focusActive: focusActiveRef.current,
      mutationPending: mutationBusyRef.current,
    });
    if (!retainRows) {
      freshlyVerifiedOwner.current = null;
      setOwnedJobs(null);
    }
    setLoading(true);
    setOwnedError(null);
    const isCurrent = () => focusActiveRef.current &&
      canCommitSavedJobsView(requestOwner, currentOwnerRef.current,
        requestGeneration, generation.current, privateVisibleRef.current);
    try {
      const verified = await readCandidateJobDiscoveryBounded({
        pin: pinCandidateAction,
        read: (pinned) => listSavedJobs(pinned.client),
        isCurrent,
        ownsPin: (pinned) =>
          candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) === requestOwner,
      });
      if (!verified.pinned.isCurrent() || !isCurrent() || !requestOwner) return;
      freshlyVerifiedOwner.current = requestOwner;
      setOwnedJobs({ ownerKey: requestOwner, value: verified.value });
    } catch {
      if (isCurrent() && requestOwner) {
        setOwnedError({ ownerKey: requestOwner,
          value: '気になる求人を取得できませんでした。通信状態を確認して更新してください。' });
      }
    } finally {
      if (refreshId === refreshSequence.current) refreshPendingRef.current = false;
      if (isCurrent()) setLoading(false);
    }
  }, [ownerKey, pinCandidateAction]);

  // A favorite may have changed in job detail or comparison while this tab
  // was blurred. Drop the old rows immediately and read canonical saves anew
  // on each focus (also after biometric unlock/account switch).
  useFocusEffect(useCallback(() => {
    if (focusedOwnerRef.current !== ownerKey) {
      // An old candidate's pending unsave may still resolve. Do not let it
      // control the next candidate's mutation flag or visible spinner.
      mutationSequence.current += 1;
      mutationBusyRef.current = false;
      setBusyId(null);
    }
    focusedOwnerRef.current = ownerKey;
    focusActiveRef.current = privateVisible && Boolean(ownerKey);
    if (!privateVisible || !ownerKey) {
      generation.current += 1;
      freshlyVerifiedOwner.current = null;
      refreshSequence.current += 1;
      refreshPendingRef.current = false;
      mutationBusyRef.current = false;
      mutationSequence.current += 1;
      setOwnedJobs(null);
      setOwnedError(null);
      setBusyId(null);
      setLoading(true);
      return;
    }
    void load();
    return () => {
      focusActiveRef.current = false;
      generation.current += 1;
      freshlyVerifiedOwner.current = null;
      refreshSequence.current += 1;
      refreshPendingRef.current = false;
      setOwnedJobs(null);
      setOwnedError(null);
      setLoading(true);
      // Do not clear an in-flight server mutation: it may still complete.
      // The generation fence prevents its delayed result from being painted.
    };
  }, [load, ownerKey, privateVisible]));

  const remove = async (jobId: string) => {
    if (!canAct || refreshPendingRef.current || mutationBusyRef.current ||
        !privateVisibleRef.current || !ownerKey ||
        !jobs?.some((job) => job.id === jobId)) return;
    mutationBusyRef.current = true;
    const mutationId = ++mutationSequence.current;
    const requestOwner = ownerKey;
    const requestGeneration = generation.current;
    setBusyId(jobId);
    setOwnedError(null);
    try {
      const pinned = await boundedPrivateRead(() => {
        if (!canPresent(requestOwner, requestGeneration) || !focusActiveRef.current)
          throw new Error('安全なログイン状態を確認できませんでした。');
        return pinCandidateAction();
      });
      if (!pinned?.isCurrent() ||
          candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== requestOwner ||
          !canPresent(requestOwner, requestGeneration)) return;
      const canonical = await removeSavedJobAndConfirm(jobId,
        () => unsaveJob(pinned.client, jobId),
        () => boundedPrivateRead(() => {
          // A completed mutation does not authorize an old candidate/session
          // to start a new private read after a lock or account switch.
          if (!pinned.isCurrent() || !canPresent(requestOwner, requestGeneration) ||
              !focusActiveRef.current)
            throw new Error('安全なログイン状態を確認できませんでした。');
          return listSavedJobs(pinned.client);
        }));
      if (!pinned.isCurrent() || !canPresent(requestOwner, requestGeneration)) return;
      setOwnedJobs({ ownerKey: requestOwner, value: canonical });
    } catch {
      if (canPresent(requestOwner, requestGeneration)) {
        // An interrupted mutation may have succeeded server-side. Do not
        // display stale rows or allow another remove until a fresh read.
        freshlyVerifiedOwner.current = null;
        setOwnedJobs(null);
        setOwnedError({ ownerKey: requestOwner,
          value: '保存状況を確認できませんでした。更新してご確認ください。' });
      }
    } finally {
      // Always settle the originating mutation, even if we navigated away
      // while the RPC was running. Never unlock a newer candidate mutation.
      if (mutationId === mutationSequence.current) {
        mutationBusyRef.current = false;
        setBusyId(null);
        // A read started on return can race with the earlier mutation.
        // After a blur, re-read the confirmed server state when active.
        if (!canPresent(requestOwner, requestGeneration) &&
            requestOwner === currentOwnerRef.current &&
            privateVisibleRef.current && focusActiveRef.current) {
          void load();
        }
      }
    }
  };

  const open = async (jobId: string, destination: SavedJobDestination = 'detail') => {
    const chosen = jobs?.find((job) => job.id === jobId);
    if (!canAct || !privateVisibleRef.current || !ownerKey || !chosen) return;
    const route = savedJobNavigationPath(jobId, chosen, destination, Date.now());
    if (!route) return;
    const requestGeneration = generation.current;
    const pinned = await pinCandidateAction();
    if (pinned?.isCurrent() &&
        candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) === ownerKey &&
        canPresent(ownerKey, requestGeneration) && focusActiveRef.current &&
        !refreshPendingRef.current && !mutationBusyRef.current) {
      // A ?apply=1 route is only a request to OPEN the existing document step.
      // Job Detail validates the live job/profile/applications again before use.
      router.push(route as never);
    }
  };

  if (!privateVisible || !ownerKey) {
    return <View testID="saved-private-shield" style={styles.center}><ActivityIndicator /></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.headerRow}>
        <Text style={styles.summary}>{jobs === null ? '—' : `${jobs.length}件`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="気になる求人を更新"
          accessibilityState={{ disabled: loading || busyId !== null }}
          onPress={() => void load(true)} disabled={loading || busyId !== null}>
          <Text style={styles.link}>更新</Text>
        </Pressable>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {jobs !== null && (loading || error) ? (
        <Text style={styles.staleNotice} accessibilityLiveRegion="polite">
          {loading ? '前回確認できた求人を表示しています。更新が完了するまで操作できません。'
            : '前回確認できた求人を表示しています。最新の保存状況を確認できるまで操作できません。'}
        </Text>
      ) : null}
      {(loading || (jobs === null && !error)) ? <ActivityIndicator /> : null}
      {!loading && !error && jobs?.length === 0 ? (
        <View testID="saved-empty-state" style={styles.empty}>
          <Text style={styles.emptyTitle}>気になる求人はまだありません</Text>
          <Text style={styles.emptyBody}>求人の♡を押すと、ここに保存されます。</Text>
          <Pressable testID="saved-empty-find-jobs" accessibilityRole="button"
            accessibilityLabel="求人を探す" style={styles.emptyAction}
            onPress={() => router.push('/(tabs)/jobs' as never)}>
            <Text style={styles.emptyActionText}>求人を探す</Text>
          </Pressable>
        </View>
      ) : null}
      {jobs !== null && jobs.length >= 2 ? (
        <Pressable style={styles.compareButton} disabled={!canAct}
          accessibilityRole="button" accessibilityState={{ disabled: !canAct }}
          onPress={() => {
          if (!canAct || refreshPendingRef.current) return;
          // Match Web Saved → Compare: pass the first three canonical saved IDs.
          // Compare revalidates IDs against its own authorized published catalog.
          const query = jobs.slice(0, 3)
            .map((job) => 'job_id=' + encodeURIComponent(job.id))
            .join('&');
          router.push(('/compare?' + query) as never);
        }}>
          <Text style={styles.compareButtonText}>園を比較する</Text>
        </Pressable>
      ) : null}
      {(jobs ?? []).map((job) => (
        <SavedJobPreviewCard key={ownerKey + ':' + job.id} job={job}
          disabled={!canAct || busyId !== null} removing={busyId === job.id}
          onOpen={() => void open(job.id)}
          onApply={() => void open(job.id, 'apply')}
          onVisit={() => void open(job.id, 'visit')}
          onRemove={() => void remove(job.id)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF8FA' },
  page: { padding: 16, gap: 12, backgroundColor: '#f7f8fa' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summary: { fontSize: 16, fontWeight: '800' },
  link: { fontWeight: '800', textDecorationLine: 'underline' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 7 },
  title: { fontSize: 18, fontWeight: '800' },
  facility: { fontWeight: '700' },
  meta: { color: '#606873' },
  compareButton: { minHeight: 50, backgroundColor: '#191c20', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  compareButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  openButton: { minHeight: 48, borderRadius: 11, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center' },
  openButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  closed: { fontSize: 14, color: '#8a4b00', backgroundColor: '#fff8e6', padding: 9, borderRadius: 8 },
  button: { minHeight: 48, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  buttonText: { fontWeight: '800' },
  empty: { backgroundColor: '#fff', borderRadius: 14, padding: 20, gap: 12 },
  emptyTitle: { color: '#30212B', fontSize: 17, fontWeight: '800' },
  emptyBody: { color: '#615B66', fontSize: 14, lineHeight: 22 },
  emptyAction: { minHeight: 48, alignSelf: 'flex-start', paddingHorizontal: 22, borderRadius: 12, backgroundColor: '#E9265A', justifyContent: 'center', alignItems: 'center' },
  emptyActionText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  error: { color: '#b42318', backgroundColor: '#fff1f0', padding: 12, borderRadius: 10 },
  staleNotice: { color: '#67545E', fontSize: 14, lineHeight: 22, backgroundColor: '#FFF0F3', padding: 12, borderRadius: 10 },
});
