import { useSession } from '@clerk/expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { usePrivateDataQuarantine } from '../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey } from '../lib/candidateViewOwner';
import { searchJobseekerJobs, type JobseekerJob } from '../lib/jobseekerCoreApi';
import { homeEvidenceMetrics, homeJobAvailability, homeJobConditions, homeJobSource } from '../lib/homeFeaturedDetails';

function salary(job: JobseekerJob): string | null {
  if (job.salary_note?.trim()) return job.salary_note;
  if (job.salary_min === null) return null;
  const prefix = job.salary_type === 'hourly' ? '時給' : job.salary_type === 'annual' ? '年収' : '月給';
  const min = job.salary_min.toLocaleString('ja-JP');
  const max = job.salary_max === null ? '〜' : job.salary_max === job.salary_min
    ? '' : `〜${job.salary_max.toLocaleString('ja-JP')}`;
  return job.salary_max === null ? `${prefix} ${min}円〜` : `${prefix} ${min}${max}円`;
}

/** The Web's three canonical featured jobs; never a cached or cross-account list. */
export function FeaturedHomeJobs() {
  const { session } = useSession();
  const router = useRouter();
  const privacy = usePrivateDataQuarantine();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const allowed = Boolean(ownerKey) && !privacy.shieldVisible && privacy.canAccessPrivateData();
  const generation = useRef(0);
  const [snapshot, setSnapshot] = useState<{ ownerKey: string; jobs: JobseekerJob[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useFocusEffect(useCallback(() => {
    const request = ++generation.current;
    setSnapshot(null);
    setError(null);
    setExpandedId(null);
    if (allowed && ownerKey) {
      void (async () => {
        try {
          const pinned = await pinCandidateAction();
          if (!pinned?.isCurrent() ||
              candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) {
            throw new Error('ログイン状態を確認できませんでした。');
          }
          const page = await searchJobseekerJobs(pinned.client, { limit: 3 });
          if (request === generation.current && pinned.isCurrent() && privacy.canAccessPrivateData()) {
            setSnapshot({ ownerKey, jobs: page.jobs });
          }
        } catch {
          if (request === generation.current && privacy.canAccessPrivateData()) {
            setError('おすすめ求人を読み込めませんでした。');
          }
        }
      })();
    }
    return () => { generation.current++; setSnapshot(null); setExpandedId(null); setError(null); };
  }, [allowed, ownerKey, pinCandidateAction, privacy.canAccessPrivateData, retry]));

  // A stale A-session result is NEVER painted during B-session or App Lock.
  const jobs = allowed && ownerKey && snapshot?.ownerKey === ownerKey ? snapshot.jobs : null;
  if (!allowed) return null;
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.heading}>おすすめ求人</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/jobs')}>
          <Text style={styles.link}>すべて見る</Text>
        </Pressable>
      </View>
      {error && <View style={styles.block}>
        <Text style={styles.error}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={() => setRetry((current) => current + 1)}>
          <Text style={styles.link}>再読み込み</Text>
        </Pressable>
      </View>}
      {!error && jobs === null && <ActivityIndicator accessibilityLabel="おすすめ求人を読み込み中" color="#CC1A3D" />}
      {!error && jobs?.length === 0 && <Text style={styles.subtle}>現在、表示できる求人はありません。</Text>}
      {!error && jobs?.map((job) => {
        const expanded = expandedId === job.id;
        const availability = homeJobAvailability(job, Date.now());
        const metrics = expanded ? [
          ...homeEvidenceMetrics(job.verified_workplace, 'workplace'),
          ...homeEvidenceMetrics(job.verified_finance, 'finance'),
        ] : [];
        return <View key={job.id} style={styles.job}>
          <Text style={styles.jobTitle}>{job.title}</Text>
          <Text style={styles.facility}>{job.facility_name}</Text>
          <Text style={styles.subtle}>{[job.prefecture, job.city, job.employment_type].filter(Boolean).join(' ・ ')}</Text>
          {salary(job) ? <Text style={styles.salary}>{salary(job)}</Text> : null}
          {job.is_external && job.source_name ? <Text style={styles.badge}>掲載元：{job.source_name}</Text> : null}
          {availability === 'closed' && <Text style={styles.error}>募集終了</Text>}
          {availability === 'unknown' && <Text style={styles.error}>募集状況を確認できません</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={styles.button}
            onPress={() => setExpandedId(expanded ? null : job.id)}>
            <Text style={styles.buttonText}>{expanded ? '閉じる' : '詳しく見る'}</Text>
          </Pressable>
          {expanded && <View style={styles.block}>
            {homeJobConditions(job).map(({ label, value }) => <Text key={label} style={styles.detail}>{label}：{value}</Text>)}
            {job.description?.trim() ? <Text style={styles.detail}>{job.description}</Text> : null}
            {metrics.map((metric) => <View key={metric.key} style={styles.block}>
              <Text style={styles.detail}>{metric.label}：{metric.displayValue}</Text>
              {metric.sample ? <Text style={styles.subtle}>{metric.sample}</Text> : null}
            </View>)}
            {homeJobSource(job).map((label) => <Text key={label} style={styles.subtle}>{label}</Text>)}
            {!job.is_external && availability === 'open' && <Pressable accessibilityRole="button" style={styles.button}
              onPress={() => router.push(`/visits?jobId=${encodeURIComponent(job.id)}` as never)}>
              <Text style={styles.buttonText}>見学・体験を予約</Text>
            </Pressable>}
          </View>}
          <Pressable accessibilityRole="button" style={styles.primary}
            onPress={() => router.push(`/job/${encodeURIComponent(job.id)}` as never)}>
            <Text style={styles.primaryText}>求人詳細・応募・気になる</Text>
          </Pressable>
        </View>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, gap: 12, borderWidth: 1, borderColor: '#F5DDE5', backgroundColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heading: { fontSize: 19, fontWeight: '800', color: '#2A202A' },
  link: { color: '#CC1A3D', fontWeight: '800', fontSize: 15 },
  job: { borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F3DAE1', backgroundColor: '#FFFDFC', gap: 9 },
  jobTitle: { fontSize: 17, lineHeight: 25, fontWeight: '800', color: '#2A202A' },
  facility: { fontSize: 15, fontWeight: '700', color: '#45404A' },
  subtle: { color: '#68616B', fontSize: 14, lineHeight: 22 },
  salary: { color: '#A3163C', fontSize: 15, fontWeight: '800' },
  badge: { alignSelf: 'flex-start', color: '#A3163C', backgroundColor: '#FFF0F4', padding: 6, borderRadius: 8 },
  error: { fontSize: 14, lineHeight: 21, color: '#9D1734' },
  block: { gap: 8 },
  detail: { fontSize: 14, lineHeight: 24, color: '#2A202A' },
  button: { minHeight: 46, borderWidth: 1, borderColor: '#E8C6D1', borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 10 },
  buttonText: { color: '#602738', fontSize: 15, fontWeight: '800' },
  primary: { minHeight: 48, borderRadius: 12, backgroundColor: '#CC1A3D', alignItems: 'center', justifyContent: 'center', padding: 10 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
