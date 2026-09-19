import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import {
  listSavedJobIds,
  saveJob,
  searchJobseekerJobs,
  unsaveJob,
  type JobSearchCursor,
  type JobseekerJob,
} from '../../lib/jobseekerCoreApi';

function salary(job: JobseekerJob) {
  if (job.salary_note) return job.salary_note;
  if (job.salary_min != null && job.salary_max != null) return `${job.salary_min.toLocaleString()}〜${job.salary_max.toLocaleString()}円`;
  if (job.salary_min != null) return `${job.salary_min.toLocaleString()}円〜`;
  return '給与は求人詳細をご確認ください';
}

function JobCard({
  job,
  saved,
  comparing,
  busy,
  onToggleSaved,
  onToggleCompare,
  onOpen,
}: {
  key?: string;
  job: JobseekerJob;
  saved: boolean;
  comparing: boolean;
  busy: boolean;
  onToggleSaved: () => void;
  onToggleCompare: () => void;
  onOpen: () => void;
}) {
  return (
    <View style={styles.jobCard}>
      <Text style={styles.jobTitle}>{job.title}</Text>
      <Text style={styles.facility}>{job.facility_name}</Text>
      <Text style={styles.meta}>{[job.prefecture, job.city, job.employment_type].filter(Boolean).join(' ・ ')}</Text>
      <Text style={styles.salary}>{salary(job)}</Text>
      <View style={styles.badges}>
        {Number(job.verified_workplace?.verified_metric_count || 0) > 0 ? <Text style={styles.badge}>HO実績</Text> : null}
        {Number(job.verified_finance?.verified_metric_count || 0) > 0 ? <Text style={styles.badge}>HF実績</Text> : null}
      </View>
      <Pressable style={styles.primaryButton} onPress={onOpen}>
        <Text style={styles.primaryButtonText}>詳細・応募を見る</Text>
      </Pressable>
      <View style={styles.actions}>
        <Pressable disabled={busy} style={styles.secondaryButton} onPress={onToggleSaved}>
          <Text style={styles.secondaryButtonText}>{saved ? '保存解除' : '保存'}</Text>
        </Pressable>
        <Pressable disabled={busy} style={[styles.secondaryButton, comparing && styles.selectedButton]} onPress={onToggleCompare}>
          <Text style={styles.secondaryButtonText}>{comparing ? '比較から外す' : '比較する'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function JobsScreen() {
  const router = useRouter();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<JobseekerJob[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [cursor, setCursor] = useState<JobSearchCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (reset: boolean, requestedQuery = query) => {
    const currentGeneration = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const [page, canonicalSaved] = await Promise.all([
        searchJobseekerJobs(pinned.client, {
          keyword: requestedQuery,
          limit: 20,
          cursor: reset ? null : cursor,
        }),
        reset ? listSavedJobIds(pinned.client) : Promise.resolve(savedIds),
      ]);
      if (!pinned.isCurrent() || currentGeneration !== generation.current) return;
      setJobs((current) => {
        if (reset) return page.jobs;
        const byId = new Map(current.map((job) => [job.id, job]));
        page.jobs.forEach((job) => byId.set(job.id, job));
        return [...byId.values()];
      });
      if (reset) setSavedIds(canonicalSaved);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setTotalCount(page.totalCount);
    } catch (loadError) {
      if (currentGeneration === generation.current) {
        setError(String((loadError as { message?: unknown })?.message ?? loadError));
      }
    } finally {
      if (currentGeneration === generation.current) setLoading(false);
    }
  }, [cursor, pinCandidateAction, query, savedIds]);

  useEffect(() => {
    void load(true, '');
    return () => {
      generation.current += 1;
    };
  }, []);

  const toggleSaved = async (jobId: string) => {
    setBusyJobId(jobId);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const currentlySaved = savedIds.includes(jobId);
      if (currentlySaved) await unsaveJob(pinned.client, jobId);
      else await saveJob(pinned.client, jobId);
      if (!pinned.isCurrent()) return;
      setSavedIds((current) => (currentlySaved ? current.filter((id) => id !== jobId) : [...current, jobId]));
    } catch (saveError) {
      setError(String((saveError as { message?: unknown })?.message ?? saveError));
    } finally {
      setBusyJobId(null);
    }
  };

  const toggleCompare = (jobId: string) => {
    setCompareIds((current) => {
      if (current.includes(jobId)) return current.filter((id) => id !== jobId);
      if (current.length >= 3) {
        setError('比較できる求人は3件までです。');
        return current;
      }
      setError(null);
      return [...current, jobId];
    });
  };

  const comparedJobs = useMemo(
    () => compareIds.flatMap((id) => jobs.find((job) => job.id === id) ?? []),
    [compareIds, jobs],
  );

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.searchCard}>
        <TextInput
          testID="job-search-keyword"
          value={query}
          onChangeText={setQuery}
          placeholder="園名・職種・地域・キーワード"
          returnKeyType="search"
          onSubmitEditing={() => void load(true, query)}
          style={styles.input}
        />
        <Pressable testID="job-search-submit" style={styles.primaryButton} onPress={() => void load(true, query)} disabled={loading}>
          <Text style={styles.primaryButtonText}>検索</Text>
        </Pressable>
        <Text style={styles.subtle}>{totalCount}件の求人</Text>
      </View>

      {comparedJobs.length > 0 ? (
        <View style={styles.compareCard}>
          <Text style={styles.sectionTitle}>比較中 {comparedJobs.length}/3</Text>
          {comparedJobs.map((job) => (
            <View key={job.id} style={styles.compareRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.compareTitle}>{job.title}</Text>
                <Text style={styles.subtle}>{job.facility_name}</Text>
                <Text style={styles.subtle}>{[job.prefecture, job.city, job.employment_type].filter(Boolean).join(' ・ ')}</Text>
                <Text style={styles.salary}>{salary(job)}</Text>
              </View>
              <Pressable onPress={() => toggleCompare(job.id)}><Text style={styles.link}>外す</Text></Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && jobs.length === 0 ? <ActivityIndicator /> : null}

      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          saved={savedIds.includes(job.id)}
          comparing={compareIds.includes(job.id)}
          busy={busyJobId === job.id}
          onToggleSaved={() => void toggleSaved(job.id)}
          onToggleCompare={() => toggleCompare(job.id)}
          onOpen={() => router.push(`/job/${job.id}` as never)}
        />
      ))}

      {hasMore ? (
        <Pressable style={styles.secondaryButtonWide} disabled={loading} onPress={() => void load(false)}>
          {loading ? <ActivityIndicator /> : <Text style={styles.secondaryButtonText}>もっと見る</Text>}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, backgroundColor: '#f7f8fa' },
  searchCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  compareCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  compareRow: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: '#eef0f2', paddingTop: 10 },
  compareTitle: { fontWeight: '800' },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  input: { borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  primaryButton: { minHeight: 46, borderRadius: 12, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  jobCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 7 },
  jobTitle: { fontSize: 18, fontWeight: '800' },
  facility: { fontWeight: '700' },
  meta: { color: '#5f6670' },
  salary: { fontWeight: '800', marginTop: 3 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { backgroundColor: '#edf4ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  secondaryButton: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  selectedButton: { backgroundColor: '#eef0f3' },
  secondaryButtonWide: { minHeight: 48, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  secondaryButtonText: { fontWeight: '800' },
  subtle: { color: '#606873', lineHeight: 20 },
  link: { fontWeight: '800', textDecorationLine: 'underline' },
  error: { color: '#b42318', backgroundColor: '#fff1f0', padding: 12, borderRadius: 10 },
});
