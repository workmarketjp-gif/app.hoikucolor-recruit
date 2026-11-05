import { useSession } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import { usePrivateDataQuarantine } from '../../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey, readCandidateOwnedView, type CandidateOwnedView } from '../../lib/candidateViewOwner';
import {
  listSavedJobIds,
  saveJob,
  searchJobseekerJobs,
  unsaveJob,
  type JobSearchCursor,
  type JobseekerJob,
} from '../../lib/jobseekerCoreApi';

function salary(job: JobseekerJob) {
  const prefix = job.salary_type === 'hourly' ? '時給' : job.salary_type === 'annual' ? '年収' : '月給';
  const range = job.salary_min == null
    ? null
    : job.salary_max == null
      ? `${prefix} ${job.salary_min.toLocaleString('ja-JP')}円〜`
      : job.salary_max === job.salary_min
        ? `${prefix} ${job.salary_min.toLocaleString('ja-JP')}円`
        : `${prefix} ${job.salary_min.toLocaleString('ja-JP')}〜${job.salary_max.toLocaleString('ja-JP')}円`;
  if (job.is_external && range) return range;
  return job.salary_note || range || '給与は求人詳細をご確認ください';
}

function JobCard({
  job,
  saved,
  busy,
  onToggleSaved,
  onOpen,
}: {
  key?: string;
  job: JobseekerJob;
  saved: boolean;
  busy: boolean;
  onToggleSaved: () => void;
  onOpen: () => void;
}) {
  return (
    <View style={styles.jobCard}>
      <Text style={styles.jobTitle}>{job.title}</Text>
      <Text style={styles.facility}>{job.facility_name}</Text>
      <Text style={styles.meta}>{[job.prefecture, job.city, job.employment_type].filter(Boolean).join(' ・ ')}</Text>
      <Text style={styles.salary}>{salary(job)}</Text>
      <View style={styles.badges}>
        {Number(job.verified_workplace?.verified_metric_count || 0) > 0 ? <Text style={styles.badge}>勤務実績データあり</Text> : null}
        {Number(job.verified_finance?.verified_metric_count || 0) > 0 ? <Text style={styles.badge}>会計実績データあり</Text> : null}
        {job.is_external && job.source_name ? <Text style={styles.badge}>{job.source_name}</Text> : null}
      </View>
      <Pressable style={styles.primaryButton} onPress={onOpen}>
        <Text style={styles.primaryButtonText}>{job.is_external ? '求人の詳細を見る' : '詳細・応募を見る'}</Text>
      </Pressable>
      <Pressable disabled={busy} style={styles.secondaryButtonWide} onPress={onToggleSaved}>
        <Text style={styles.secondaryButtonText}>{saved ? '気になるから外す' : '♡ 気になる'}</Text>
      </Pressable>
    </View>
  );
}

export default function JobsScreen() {
  const router = useRouter();
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const privateAllowed = privacy.canAccessPrivateData();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [ownedQuery, setOwnedQuery] = useState<CandidateOwnedView<string> | null>(null);
  const query = readCandidateOwnedView(ownedQuery, ownerKey, privateAllowed) ?? '';
  const editQuery = (value: string) => {
    if (ownerKey && privateAllowed) setOwnedQuery({ ownerKey, value });
  };
  const [ownedJobs, setOwnedJobs] = useState<CandidateOwnedView<JobseekerJob[]> | null>(null);
  const [ownedSavedIds, setOwnedSavedIds] = useState<CandidateOwnedView<string[]> | null>(null);
  const savedIds = readCandidateOwnedView(ownedSavedIds, ownerKey, privateAllowed);
  const visibleJobs = readCandidateOwnedView(ownedJobs, ownerKey, privateAllowed);
  const jobs = visibleJobs ?? [];
  const [cursor, setCursor] = useState<JobSearchCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [ownedError, setOwnedError] = useState<CandidateOwnedView<string> | null>(null);
  const error = readCandidateOwnedView(ownedError, ownerKey, privateAllowed);
  const generation = useRef(0);

  const load = useCallback(async (reset: boolean, requestedQuery = query) => {
    const currentGeneration = ++generation.current;
    setLoading(true);
    setOwnedError(null);
    if (reset) {
      setOwnedJobs(null);
      setOwnedSavedIds(null);
      setCursor(null);
      setHasMore(false);
      setTotalCount(0);
    }
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) throw new Error('安全なログイン状態を確認できませんでした。');
      if (!reset && (savedIds === null || visibleJobs === null)) throw new Error('検索結果を確認できません。更新してください。');
      const [page, canonicalSaved] = await Promise.all([
        searchJobseekerJobs(pinned.client, {
          keyword: requestedQuery,
          limit: 20,
          cursor: reset ? null : cursor,
        }),
        reset ? listSavedJobIds(pinned.client) : Promise.resolve(savedIds ?? []),
      ]);
      if (!pinned.isCurrent() || currentGeneration !== generation.current) return;
      setOwnedJobs((previous) => {
        const ownedKey = candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId);
        if (!ownedKey || ownedKey !== ownerKey) return previous;
        const previousJobs = readCandidateOwnedView(previous, ownedKey, true);
        const byId = new Map((reset ? [] : (previousJobs ?? [])).map((job) => [job.id, job]));
        page.jobs.forEach((job) => byId.set(job.id, job));
        return { ownerKey: ownedKey, value: [...byId.values()] };
      });
      if (reset) setOwnedSavedIds({ ownerKey: candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId)!, value: canonicalSaved });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setTotalCount(page.totalCount);
    } catch (loadError) {
      if (currentGeneration === generation.current) {
        setOwnedError(ownerKey ? { ownerKey, value: String((loadError as { message?: unknown })?.message ?? loadError) } : null);
      }
    } finally {
      if (currentGeneration === generation.current) setLoading(false);
    }
  }, [cursor, ownerKey, pinCandidateAction, query, savedIds, visibleJobs]);

  useEffect(() => {
    setOwnedQuery(null);
    void load(true, '');
    return () => {
      generation.current += 1;
    };
  }, [ownerKey]);

  const toggleSaved = async (jobId: string) => {
    if (!privateAllowed || savedIds === null || !jobs.some((job) => job.id === jobId)) return;
    setBusyJobId(jobId);
    setOwnedError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) throw new Error('安全なログイン状態を確認できませんでした。');
      const currentlySaved = savedIds.includes(jobId);
      if (currentlySaved) await unsaveJob(pinned.client, jobId);
      else await saveJob(pinned.client, jobId);
      if (!pinned.isCurrent()) return;
      setOwnedSavedIds((current) => current?.ownerKey === candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId)
        ? { ...current, value: currentlySaved ? current.value.filter((id) => id !== jobId) : [...current.value, jobId] } : current);
    } catch (saveError) {
      setOwnedError(ownerKey ? { ownerKey, value: String((saveError as { message?: unknown })?.message ?? saveError) } : null);
    } finally {
      setBusyJobId(null);
    }
  };



  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.searchCard}>
        <TextInput
          testID="job-search-keyword"
          value={query}
          onChangeText={editQuery}
          placeholder="園名・職種・地域・キーワード"
          returnKeyType="search"
          onSubmitEditing={() => void load(true, query)}
          style={styles.input}
        />
        <Pressable testID="job-search-submit" style={styles.primaryButton} onPress={() => void load(true, query)} disabled={loading}>
          <Text style={styles.primaryButtonText}>検索</Text>
        </Pressable>
        <Text style={styles.subtle}>{error || loading || visibleJobs === null ? '検索中・確認待ち' : `${totalCount}件の求人`}</Text>
      </View>

      <View style={styles.resultBar}>
        <Text style={styles.resultCount}>{error || loading || visibleJobs === null ? '—' : `${totalCount}件`}</Text>
        {!query.trim() ? (
          <Pressable onPress={() => router.push('/matches' as never)}>
            <Text style={styles.link}>マッチ度順で見る</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && jobs.length === 0 ? <ActivityIndicator /> : null}

      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          saved={savedIds?.includes(job.id) === true}
          busy={busyJobId === job.id || savedIds === null || !privateAllowed}
          onToggleSaved={() => void toggleSaved(job.id)}
          onOpen={() => router.push(`/job/${job.id}` as never)}
        />
      ))}

      {hasMore && visibleJobs !== null ? (
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
  resultBar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  resultCount: { fontSize: 16, fontWeight: '800' },
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
  secondaryButtonWide: { minHeight: 48, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  secondaryButtonText: { fontWeight: '800' },
  subtle: { color: '#606873', lineHeight: 20 },
  link: { fontWeight: '800', textDecorationLine: 'underline' },
  error: { color: '#b42318', backgroundColor: '#fff1f0', padding: 12, borderRadius: 10 },
});
