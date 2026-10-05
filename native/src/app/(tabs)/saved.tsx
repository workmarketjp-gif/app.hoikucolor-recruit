import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import {
  listSavedJobsWithStatus,
  unsaveJob,
  type SavedJobWithStatus,
} from '../../lib/jobseekerCoreApi';

export default function SavedJobsScreen() {
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [jobs, setJobs] = useState<SavedJobWithStatus[] | null>(null);
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
      const next = await listSavedJobsWithStatus(pinned.client);
      if (!pinned.isCurrent() || currentGeneration !== generation.current) return;
      setJobs(next);
    } catch (loadError) {
      if (currentGeneration === generation.current) {
        setError(String((loadError as { message?: unknown })?.message ?? loadError));
      }
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
      setJobs((current) => current ? current.filter((job) => job.id !== jobId) : current);
    } catch (removeError) {
      setError(String((removeError as { message?: unknown })?.message ?? removeError));
    } finally {
      setBusyId(null);
    }
  };

  const countLabel = jobs ? `${jobs.length}件` : loading ? '確認中…' : '件数不明';

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.headerRow}>
        <Text style={styles.summary}>{countLabel}</Text>
        <Pressable onPress={() => void load()} disabled={loading}>
          <Text style={[styles.link, loading && styles.linkDisabled]}>{loading ? '更新中…' : '更新'}</Text>
        </Pressable>
      </View>
      {error ? (
        <View style={styles.errorPanel}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => void load()} disabled={loading}>
            <Text style={styles.retryButtonText}>同じ画面で再読み込み</Text>
          </Pressable>
        </View>
      ) : null}
      {loading && jobs === null ? <ActivityIndicator /> : null}
      {!loading && jobs !== null && jobs.length === 0 ? <Text style={styles.empty}>保存した求人はまだありません。</Text> : null}
      {(jobs ?? []).map((job) => (
        <View key={job.id} style={[styles.card, !job.is_open && styles.closedCard]}>
          <View style={styles.cardHeading}>
            <View style={styles.cardHeadingCopy}>
              <Text style={styles.title}>{job.title}</Text>
              <Text style={styles.facility}>{job.facility_name}</Text>
            </View>
            <Text style={[styles.status, job.is_open ? styles.statusOpen : styles.statusClosed]}>
              {job.is_open ? '募集中' : '募集終了'}
            </Text>
          </View>
          <Text style={styles.meta}>{[job.prefecture, job.city, job.employment_type].filter(Boolean).join(' ・ ')}</Text>
          {!job.is_open ? <Text style={styles.closedNote}>募集は終了しています。保存履歴として求人情報を確認できます。</Text> : null}
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
  linkDisabled: { opacity: 0.5 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 7 },
  closedCard: { borderWidth: 1, borderColor: '#e2e5e9' },
  cardHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  cardHeadingCopy: { flex: 1, gap: 4 },
  title: { fontSize: 18, fontWeight: '800' },
  facility: { fontWeight: '700' },
  meta: { color: '#606873' },
  status: { fontSize: 12, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
  statusOpen: { color: '#18794e', backgroundColor: '#e8f5ee' },
  statusClosed: { color: '#6b7280', backgroundColor: '#f0f1f3' },
  closedNote: { color: '#606873', lineHeight: 20 },
  button: { minHeight: 42, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  buttonText: { fontWeight: '800' },
  empty: { backgroundColor: '#fff', borderRadius: 14, padding: 20, color: '#606873' },
  errorPanel: { backgroundColor: '#fff1f0', borderRadius: 10, padding: 12, gap: 10 },
  error: { color: '#b42318' },
  retryButton: { minHeight: 42, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  retryButtonText: { fontWeight: '800' },
});
