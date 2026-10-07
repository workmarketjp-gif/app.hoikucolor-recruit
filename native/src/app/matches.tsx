import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import {
  getJobseekerProfile,
  listRankedJobs,
  listSavedJobIds,
  saveJob,
  unsaveJob,
  type JobseekerJob,
  type JobseekerProfile,
} from '../lib/jobseekerCoreApi';
import { getJobseekerMatchingPreferences, type JobseekerMatchingPreferences } from '../lib/candidateParityApi';
import { compareMatchedJobs, hasMatchingPreferences, matchJob, type JobMatchResult } from '../lib/jobMatching';

type RankedJob = { job: JobseekerJob; match: JobMatchResult };

function salary(job: JobseekerJob) {
  const prefix = job.salary_type === 'hourly' ? '時給' : job.salary_type === 'annual' ? '年収' : '月給';
  if (job.salary_min != null && job.salary_max != null) {
    return job.salary_min === job.salary_max
      ? `${prefix} ${job.salary_min.toLocaleString('ja-JP')}円`
      : `${prefix} ${job.salary_min.toLocaleString('ja-JP')}〜${job.salary_max.toLocaleString('ja-JP')}円`;
  }
  if (job.salary_min != null) return `${prefix} ${job.salary_min.toLocaleString('ja-JP')}円〜`;
  return job.salary_note || '給与は詳細をご確認ください';
}

export default function MatchesScreen() {
  const router = useRouter();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [jobs, setJobs] = useState<JobseekerJob[]>([]);
  const [profile, setProfile] = useState<JobseekerProfile | null>(null);
  const [preferences, setPreferences] = useState<JobseekerMatchingPreferences | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [onlyStrong, setOnlyStrong] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const [nextJobs, nextProfile, nextPreferences, nextSaved] = await Promise.all([
        listRankedJobs(pinned.client),
        getJobseekerProfile(pinned.client),
        getJobseekerMatchingPreferences(pinned.client),
        listSavedJobIds(pinned.client),
      ]);
      if (!pinned.isCurrent() || current !== generation.current) return;
      setJobs(nextJobs);
      setProfile(nextProfile);
      setPreferences(nextPreferences);
      setSavedIds(nextSaved);
    } catch (loadError) {
      if (current === generation.current) setError(String((loadError as { message?: unknown })?.message ?? loadError));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [pinCandidateAction]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const ranked = useMemo<RankedJob[]>(() => {
    if (!preferences) return [];
    return jobs
      .map((job) => ({ job, match: matchJob({ job, profile, preferences }) }))
      .sort(compareMatchedJobs);
  }, [jobs, preferences, profile]);

  const hasPreferences = Boolean(preferences && hasMatchingPreferences(profile, preferences));
  const visible = onlyStrong
    ? ranked.filter((item) => item.match.condition_score !== null && item.match.condition_score >= 70)
    : ranked;

  const toggleSaved = async (jobId: string) => {
    setBusyId(jobId);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const isSaved = savedIds.includes(jobId);
      if (isSaved) await unsaveJob(pinned.client, jobId);
      else await saveJob(pinned.client, jobId);
      if (!pinned.isCurrent()) return;
      setSavedIds((current) => isSaved ? current.filter((id) => id !== jobId) : [...current, jobId]);
    } catch (saveError) {
      setError(String((saveError as { message?: unknown })?.message ?? saveError));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View>
        <Text style={styles.title}>マッチ度</Text>
        <Text style={styles.bodyMuted}>あなたの希望条件に合う順です。</Text>
      </View>

      <View style={styles.explain}>
        <Text style={styles.explainTitle}>点数の決め方</Text>
        <Text style={styles.bodyMuted}>
          勤務地・雇用形態・給与などは通常ロジックで判定し、保育観は求人文面との一致サインを分けて表示します。勤務実績・会計実績は、同じ点数のときの並び順にだけ使います。
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator /> : null}

      {!loading && !hasPreferences ? (
        <View style={styles.callout}>
          <Text style={styles.itemTitle}>希望条件と保育観を登録すると、おすすめ順が使えます。</Text>
          <Pressable style={styles.primaryButtonWide} onPress={() => router.push('/scouts' as never)}>
            <Text style={styles.primaryText}>条件を登録する</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading ? (
        <View style={styles.resultBar}>
          <Text style={styles.resultText}>{visible.length}件　条件マッチ順</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: onlyStrong }}
            style={[styles.filterButton, onlyStrong && styles.filterActive]}
            onPress={() => setOnlyStrong((current) => !current)}
          >
            <Text style={styles.filterText}>70%以上だけ表示</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && visible.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.itemTitle}>表示できる求人がありません</Text>
          <Text style={styles.bodyMuted}>
            {ranked.length ? '「70%以上だけ表示」を解除すると、すべての求人を確認できます。' : '現在公開中の求人はありません。'}
          </Text>
        </View>
      ) : null}

      {visible.map(({ job, match }) => (
        <View key={job.id} style={styles.card}>
          <Text style={styles.facility}>{job.facility_name}</Text>
          <Text style={styles.itemTitle}>{job.title}</Text>
          <Text style={styles.bodyMuted}>{[job.prefecture, job.city, job.employment_type].filter(Boolean).join(' ・ ')}</Text>
          <Text style={styles.salary}>{salary(job)}</Text>

          <View style={styles.scoreRow}>
            <View style={[styles.score, (match.condition_score ?? 0) >= 70 && styles.scoreStrong]}>
              <Text style={styles.scoreLabel}>条件マッチ</Text>
              <Text style={styles.scoreValue}>{match.condition_score === null ? '—' : `${match.condition_score}%`}</Text>
            </View>
            <View style={styles.score}>
              <Text style={styles.scoreLabel}>保育観サイン</Text>
              <Text style={styles.scoreValue}>
                {match.childcare_value_signal_pct === null
                  ? '未設定'
                  : `${match.matched_childcare_values.length}/${match.matched_childcare_values.length + match.unmatched_childcare_values.length}一致`}
              </Text>
            </View>
          </View>

          {match.condition_reasons.slice(0, 3).map((reason) => <Text key={reason} style={styles.reason}>✓ {reason}</Text>)}
          {match.condition_gaps.length > 0 ? <Text style={styles.gap}>確認したい点：{match.condition_gaps.slice(0, 2).join('・')}</Text> : null}
          {match.unmatched_childcare_values.length > 0 ? (
            <Text style={styles.gap}>「{match.unmatched_childcare_values.join('・')}」は求人文面だけでは確認できません。</Text>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable
              style={styles.secondaryButton}
              disabled={busyId === job.id}
              onPress={() => void toggleSaved(job.id)}
            >
              <Text style={styles.secondaryText}>{savedIds.includes(job.id) ? '気になる済み' : '気になる'}</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={() => router.push(`/job/${job.id}` as never)}>
              <Text style={styles.primaryText}>詳しく見る</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <Pressable style={styles.secondaryButtonWide} onPress={() => router.push('/scouts' as never)}>
        <Text style={styles.secondaryText}>希望条件を見直す</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, backgroundColor: '#f7f8fa', flexGrow: 1 },
  title: { fontSize: 26, fontWeight: '900' },
  bodyMuted: { fontSize: 15, lineHeight: 22, color: '#606873' },
  explain: { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 5 },
  explainTitle: { fontSize: 16, fontWeight: '900' },
  callout: { backgroundColor: '#fff8e6', borderRadius: 16, padding: 16, gap: 12 },
  resultBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  resultText: { flex: 1, fontSize: 16, fontWeight: '800' },
  filterButton: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#fff' },
  filterActive: { borderColor: '#e8445a', backgroundColor: '#fff0f3' },
  filterText: { fontSize: 14, fontWeight: '800' },
  empty: { backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 8 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8 },
  facility: { fontSize: 16, fontWeight: '800', color: '#4a4f59' },
  itemTitle: { fontSize: 18, fontWeight: '900' },
  salary: { fontSize: 17, fontWeight: '900' },
  scoreRow: { flexDirection: 'row', gap: 8 },
  score: { flex: 1, backgroundColor: '#f2f4f7', borderRadius: 12, padding: 12, gap: 3 },
  scoreStrong: { backgroundColor: '#ecfdf3' },
  scoreLabel: { fontSize: 14, color: '#606873', fontWeight: '700' },
  scoreValue: { fontSize: 22, fontWeight: '900' },
  reason: { fontSize: 15, lineHeight: 21, color: '#067647' },
  gap: { fontSize: 14, lineHeight: 20, color: '#7a4d00' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  primaryButton: { flex: 1, minHeight: 50, borderRadius: 12, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  primaryButtonWide: { minHeight: 52, borderRadius: 12, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  secondaryButton: { flex: 1, minHeight: 50, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  secondaryButtonWide: { minHeight: 50, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  secondaryText: { fontSize: 15, fontWeight: '800' },
  error: { fontSize: 15, color: '#b42318', backgroundColor: '#fff1f0', padding: 12, borderRadius: 10 },
});
