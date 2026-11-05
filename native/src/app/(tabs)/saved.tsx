import { useSession } from '@clerk/expo';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import { listSavedJobs, unsaveJob, type SavedJobseekerJob } from '../../lib/jobseekerCoreApi';
import { canCommitSavedJobsView, removeSavedJobAndConfirm } from '../../lib/savedJobsReadback';
import { usePrivateDataQuarantine } from '../../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey, readCandidateOwnedView, type CandidateOwnedView } from '../../lib/candidateViewOwner';

export default function SavedJobsScreen() {
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
  const mutationBusyRef = useRef(false);
  const mutationSequence = useRef(0);
  const focusedOwnerRef = useRef<string | null>(null);
  const focusActiveRef = useRef(false);
  const currentOwnerRef = useRef(ownerKey);
  const privateVisible = Boolean(ownerKey) && !privacy.shieldVisible && privacy.canAccessPrivateData();
  const privateVisibleRef = useRef(privateVisible);
  currentOwnerRef.current = ownerKey;
  privateVisibleRef.current = privateVisible;

  const jobs = readCandidateOwnedView(ownedJobs, ownerKey, privateVisible);
  const error = readCandidateOwnedView(ownedError, ownerKey, privateVisible);
  const canPresent = (requestOwner: string | null, requestGeneration: number) =>
    canCommitSavedJobsView(requestOwner, currentOwnerRef.current, requestGeneration,
      generation.current, privateVisibleRef.current);

  const load = useCallback(async () => {
    const requestOwner = ownerKey;
    const requestGeneration = ++generation.current;
    setLoading(true);
    setOwnedJobs(null);
    setOwnedError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() ||
          candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== requestOwner) {
        throw new Error('安全なログイン状態を確認できませんでした。');
      }
      const next = await listSavedJobs(pinned.client);
      if (!pinned.isCurrent() || !requestOwner ||
          !canCommitSavedJobsView(requestOwner, currentOwnerRef.current, requestGeneration,
            generation.current, privateVisibleRef.current)) return;
      setOwnedJobs({ ownerKey: requestOwner, value: next });
    } catch {
      if (requestOwner &&
          canCommitSavedJobsView(requestOwner, currentOwnerRef.current, requestGeneration,
            generation.current, privateVisibleRef.current)) {
        setOwnedError({ ownerKey: requestOwner, value: '気になる求人を取得できませんでした。更新してください。' });
      }
    } finally {
      if (canCommitSavedJobsView(requestOwner, currentOwnerRef.current, requestGeneration,
          generation.current, privateVisibleRef.current)) setLoading(false);
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
      setOwnedJobs(null);
      setOwnedError(null);
      setLoading(true);
      // Do not clear an in-flight server mutation: it may still complete.
      // The generation fence prevents its delayed result from being painted.
    };
  }, [load, ownerKey, privateVisible]));

  const remove = async (jobId: string) => {
    if (!privateVisibleRef.current || !ownerKey || loading ||
        mutationBusyRef.current || !jobs?.some((job) => job.id === jobId)) return;
    mutationBusyRef.current = true;
    const mutationId = ++mutationSequence.current;
    const requestOwner = ownerKey;
    const requestGeneration = generation.current;
    setBusyId(jobId);
    setOwnedError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() ||
          candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== requestOwner ||
          !canPresent(requestOwner, requestGeneration)) return;
      const canonical = await removeSavedJobAndConfirm(jobId,
        () => unsaveJob(pinned.client, jobId),
        () => listSavedJobs(pinned.client));
      if (!pinned.isCurrent() || !canPresent(requestOwner, requestGeneration)) return;
      setOwnedJobs({ ownerKey: requestOwner, value: canonical });
    } catch {
      if (canPresent(requestOwner, requestGeneration)) {
        // An interrupted mutation may have succeeded server-side. Do not
        // display stale rows or allow another remove until a fresh read.
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

  const open = async (jobId: string) => {
    if (!privateVisibleRef.current || !ownerKey || !jobs?.some((job) => job.id === jobId)) return;
    const requestGeneration = generation.current;
    const pinned = await pinCandidateAction();
    if (pinned?.isCurrent() &&
        candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) === ownerKey &&
        canPresent(ownerKey, requestGeneration)) router.push(`/job/${jobId}` as never);
  };

  if (!privateVisible || !ownerKey) {
    return <View testID="saved-private-shield" style={styles.center}><ActivityIndicator /></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.headerRow}>
        <Text style={styles.summary}>{jobs === null ? '—' : `${jobs.length}件`}</Text>
        <Pressable onPress={() => void load()} disabled={loading || busyId !== null}><Text style={styles.link}>更新</Text></Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {(loading || (jobs === null && !error)) ? <ActivityIndicator /> : null}
      {!loading && !error && jobs?.length === 0 ? <Text style={styles.empty}>気になる求人はまだありません。求人の♡を押すと、ここに保存されます。</Text> : null}
      {jobs !== null && jobs.length >= 2 ? (
        <Pressable style={styles.compareButton} onPress={() => router.push('/compare' as never)}>
          <Text style={styles.compareButtonText}>園を比較する</Text>
        </Pressable>
      ) : null}
      {(jobs ?? []).map((job) => (
        <View key={job.id} style={styles.card}>
          <Text style={styles.title}>{job.title}</Text>
          <Text style={styles.facility}>{job.facility_name}</Text>
          <Text style={styles.meta}>{[job.prefecture, job.city, job.employment_type].filter(Boolean).join(' ・ ')}</Text>
          {!job.is_open ? <Text style={styles.closed}>この求人は募集を終了しています。</Text> : null}
          <Pressable style={styles.openButton} onPress={() => void open(job.id)}>
            <Text style={styles.openButtonText}>求人を見る</Text>
          </Pressable>
          <Pressable disabled={loading || busyId !== null} style={styles.button} onPress={() => void remove(job.id)}>
            {busyId === job.id ? <ActivityIndicator /> : <Text style={styles.buttonText}>保存から外す</Text>}
          </Pressable>
        </View>
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
  empty: { backgroundColor: '#fff', borderRadius: 14, padding: 20, color: '#606873' },
  error: { color: '#b42318', backgroundColor: '#fff1f0', padding: 12, borderRadius: 10 },
});
