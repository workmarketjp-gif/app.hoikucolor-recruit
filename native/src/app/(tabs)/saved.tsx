import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import { listSavedJobs, unsaveJob, type SavedJobseekerJob } from '../../lib/jobseekerCoreApi';

export default function SavedJobsScreen() {
  const router = useRouter();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [jobs, setJobs] = useState<SavedJobseekerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const currentGeneration = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const next = await listSavedJobs(pinned.client);
      if (!pinned.isCurrent() || currentGeneration !== generation.current) return;
      setJobs(next);
    } catch (loadError) {
      if (currentGeneration === generation.current) setError(String((loadError as { message?: unknown })?.message ?? loadError));
    } finally {
      if (currentGeneration === generation.current) setLoading(false);
    }
  }, [pinCandidateAction]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const remove = async (jobId: string) => {
    setBusyId(jobId);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      await unsaveJob(pinned.client, jobId);
      if (!pinned.isCurrent()) return;
      setJobs((current) => current.filter((job) => job.id !== jobId));
    } catch (removeError) {
      setError(String((removeError as { message?: unknown })?.message ?? removeError));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.headerRow}>
        <Text style={styles.summary}>{jobs.length}件</Text>
        <Pressable onPress={() => void load()}><Text style={styles.link}>更新</Text></Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && jobs.length === 0 ? <ActivityIndicator /> : null}
      {!loading && jobs.length === 0 ? <Text style={styles.empty}>気になる求人はまだありません。求人の♡を押すと、ここに保存されます。</Text> : null}
      {jobs.length >= 2 ? (
        <Pressable style={styles.compareButton} onPress={() => router.push('/compare' as never)}>
          <Text style={styles.compareButtonText}>園を比較する</Text>
        </Pressable>
      ) : null}
      {jobs.map((job) => (
        <View key={job.id} style={styles.card}>
          <Text style={styles.title}>{job.title}</Text>
          <Text style={styles.facility}>{job.facility_name}</Text>
          <Text style={styles.meta}>{[job.prefecture, job.city, job.employment_type].filter(Boolean).join(' ・ ')}</Text>
          {!job.is_open ? <Text style={styles.closed}>この求人は募集を終了しています。</Text> : null}
          <Pressable style={styles.openButton} onPress={() => router.push(`/job/${job.id}` as never)}>
            <Text style={styles.openButtonText}>求人を見る</Text>
          </Pressable>
          <Pressable disabled={busyId === job.id} style={styles.button} onPress={() => void remove(job.id)}>
            {busyId === job.id ? <ActivityIndicator /> : <Text style={styles.buttonText}>保存から外す</Text>}
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
