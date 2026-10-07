import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { getJobseekerProfile } from '../lib/jobseekerCoreApi';
import { submitApplication } from '../lib/applicationJourneyApi';
import {
  listMySpotAssignments,
  listSpotJobs,
  type SpotAssignment,
  type SpotJobListing,
} from '../lib/candidateParityApi';

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

function formatWorkedMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}時間${minutes}分` : `${hours}時間`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00+09:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' }).format(date);
}

function statusLabel(status: string) {
  return ({
    confirmed: '勤務確定',
    completed: '勤務完了',
    cancelled: 'キャンセル',
    no_show: '未勤務',
  } as Record<string, string>)[status] || status;
}

function applicationStatusLabel(status: string | null) {
  if (!status) return '';
  return ({
    new: '応募済み',
    applied: '応募済み',
    reviewing: '確認中',
    screening: '確認中',
    interview: '面接調整中',
    hired: '確定',
    rejected: '不採用',
    withdrawn: '辞退',
  } as Record<string, string>)[status] || status;
}

function SpotFacts({ workDate, startTime, endTime, hourlyRate, breakMinutes }: {
  workDate: string;
  startTime: string;
  endTime: string;
  hourlyRate: number;
  breakMinutes: number;
}) {
  return (
    <View style={styles.facts}>
      <View style={styles.fact}><Text style={styles.factLabel}>勤務日</Text><Text style={styles.factValue}>{formatDate(workDate)}</Text></View>
      <View style={styles.fact}><Text style={styles.factLabel}>勤務時間</Text><Text style={styles.factValue}>{startTime.slice(0, 5)}〜{endTime.slice(0, 5)}</Text></View>
      <View style={styles.fact}><Text style={styles.factLabel}>時給</Text><Text style={styles.factValue}>¥{Number(hourlyRate).toLocaleString('ja-JP')}</Text></View>
      <View style={styles.fact}><Text style={styles.factLabel}>休憩</Text><Text style={styles.factValue}>{breakMinutes}分</Text></View>
    </View>
  );
}

export default function SpotJobsScreen() {
  const router = useRouter();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [jobs, setJobs] = useState<SpotJobListing[]>([]);
  const [assignments, setAssignments] = useState<SpotAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (quiet = false) => {
    const current = ++generation.current;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const [nextJobs, nextAssignments] = await Promise.all([
        listSpotJobs(pinned.client),
        listMySpotAssignments(pinned.client),
      ]);
      if (!pinned.isCurrent() || current !== generation.current) return;
      setJobs(nextJobs);
      setAssignments(nextAssignments);
    } catch (loadError) {
      if (current === generation.current) setError(String((loadError as { message?: unknown })?.message ?? loadError));
    } finally {
      if (current === generation.current && !quiet) setLoading(false);
    }
  }, [pinCandidateAction]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const apply = async (job: SpotJobListing) => {
    setBusyId(job.job_id);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const profile = await getJobseekerProfile(pinned.client);
      if (!pinned.isCurrent()) return;
      if (!profile?.name?.trim()) {
        router.push('/(tabs)/profile');
        return;
      }
      const result = await submitApplication(pinned.client, job.job_id, profile);
      if (!pinned.isCurrent()) return;
      await load(true);
      router.push(`/application/${result.applicationId}` as never);
    } catch (applyError) {
      setError(String((applyError as { message?: unknown })?.message ?? applyError));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View>
        <Text style={styles.title}>スポット勤務</Text>
        <Text style={styles.bodyMuted}>1日単位で働ける勤務です。通常求人とは分けて表示しています。</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && jobs.length === 0 && assignments.length === 0 ? <ActivityIndicator /> : null}

      {assignments.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>あなたのスポット勤務</Text>
          {assignments.map((assignment) => (
            <AssignmentCard
              key={assignment.assignment_id}
              assignment={assignment}
              onOpen={() => router.push(`/application/${assignment.application_id}` as never)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>募集中のスポット勤務</Text>
        {!loading && jobs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.itemTitle}>現在募集中のスポット勤務はありません</Text>
            <Text style={styles.bodyMuted}>新しい勤務枠が公開されると、ここに表示されます。</Text>
            <Pressable style={styles.secondaryButtonWide} onPress={() => router.push('/(tabs)/jobs')}>
              <Text style={styles.secondaryText}>通常の求人を見る</Text>
            </Pressable>
          </View>
        ) : jobs.map((job) => (
          <SpotCard
            key={job.job_id}
            job={job}
            busy={busyId === job.job_id}
            onApply={() => void apply(job)}
            onOpenApplication={() => job.application_id && router.push(`/application/${job.application_id}` as never)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function AssignmentCard({ assignment, onOpen }: { key?: string; assignment: SpotAssignment; onOpen: () => void }) {
  const workedMinutes = useMemo(
    () => Math.max(0, timeToMinutes(assignment.end_time) - timeToMinutes(assignment.start_time) - assignment.break_minutes),
    [assignment],
  );
  return (
    <View style={styles.card}>
      <View style={styles.badgeRow}>
        <Text style={styles.badge}>{statusLabel(assignment.assignment_status)}</Text>
        {assignment.assignment_status === 'confirmed' ? <Text style={styles.badge}>勤務シフトに登録済み</Text> : null}
      </View>
      <Text style={styles.facility}>{assignment.facility_name}</Text>
      <Text style={styles.itemTitle}>{assignment.title}</Text>
      <Text style={styles.bodyMuted}>{[assignment.prefecture, assignment.city].filter(Boolean).join(' ') || '地域未設定'}</Text>
      <SpotFacts
        workDate={assignment.work_date}
        startTime={assignment.start_time}
        endTime={assignment.end_time}
        hourlyRate={assignment.hourly_rate}
        breakMinutes={assignment.break_minutes}
      />
      <Text style={styles.bodyMuted}>実働 {formatWorkedMinutes(workedMinutes)}{assignment.address ? ` ・ ${assignment.address}` : ''}</Text>
      <Pressable style={styles.secondaryButtonWide} onPress={onOpen}>
        <Text style={styles.secondaryText}>応募内容を見る</Text>
      </Pressable>
    </View>
  );
}

function SpotCard({
  job,
  busy,
  onApply,
  onOpenApplication,
}: {
  key?: string;
  job: SpotJobListing;
  busy: boolean;
  onApply: () => void;
  onOpenApplication: () => void;
}) {
  const workedMinutes = useMemo(
    () => Math.max(0, timeToMinutes(job.end_time) - timeToMinutes(job.start_time) - job.break_minutes),
    [job],
  );
  const applied = Boolean(job.application_id);
  return (
    <View style={styles.card}>
      <View style={styles.badgeRow}>
        <Text style={styles.badgeAccent}>スポット勤務</Text>
        <Text style={styles.badge}>残り {job.available_count}枠</Text>
      </View>
      <Text style={styles.facility}>{job.facility_name}</Text>
      <Text style={styles.itemTitle}>{job.title}</Text>
      <Text style={styles.bodyMuted}>{[job.prefecture, job.city].filter(Boolean).join(' ') || '地域未設定'}</Text>
      <SpotFacts
        workDate={job.work_date}
        startTime={job.start_time}
        endTime={job.end_time}
        hourlyRate={job.hourly_rate}
        breakMinutes={job.break_minutes}
      />
      <Text style={styles.body}>実働 {formatWorkedMinutes(workedMinutes)}</Text>
      <Text style={styles.body}>募集枠 {job.required_count}名</Text>
      {job.age_group_or_class ? <Text style={styles.body}>担当 {job.age_group_or_class}</Text> : null}
      {job.required_qualification ? <Text style={styles.body}>資格 {job.required_qualification}</Text> : null}
      {job.description ? <Text style={styles.body}>{job.description}</Text> : null}
      {job.facility_message ? <Text style={styles.quote}>園からのメッセージ{`\n`}{job.facility_message}</Text> : null}
      {applied ? (
        <>
          <Text style={styles.success}>応募済み{job.application_status ? `・${applicationStatusLabel(job.application_status)}` : ''}</Text>
          <Pressable style={styles.primaryButtonWide} onPress={onOpenApplication}>
            <Text style={styles.primaryText}>応募状況を見る</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          style={styles.primaryButtonWide}
          disabled={busy || job.available_count <= 0}
          onPress={onApply}
        >
          <Text style={styles.primaryText}>{busy ? '応募中…' : job.available_count <= 0 ? '満員です' : 'このスポットに応募'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, backgroundColor: '#f7f8fa', flexGrow: 1 },
  title: { fontSize: 26, fontWeight: '900' },
  section: { gap: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '900' },
  itemTitle: { fontSize: 18, fontWeight: '900' },
  facility: { fontSize: 16, fontWeight: '800' },
  body: { fontSize: 16, lineHeight: 23, color: '#252a31' },
  bodyMuted: { fontSize: 15, lineHeight: 22, color: '#606873' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  empty: { backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 12 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { fontSize: 14, fontWeight: '800', backgroundColor: '#f2f4f7', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, overflow: 'hidden' },
  badgeAccent: { fontSize: 14, fontWeight: '800', backgroundColor: '#fff0f3', color: '#b4233e', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, overflow: 'hidden' },
  facts: { gap: 7, backgroundColor: '#f7f8fa', borderRadius: 12, padding: 12 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  factLabel: { fontSize: 14, color: '#606873' },
  factValue: { fontSize: 15, fontWeight: '800', textAlign: 'right', flex: 1 },
  quote: { fontSize: 15, lineHeight: 22, backgroundColor: '#f5f8ff', padding: 12, borderRadius: 10 },
  primaryButtonWide: { minHeight: 52, borderRadius: 12, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  secondaryButtonWide: { minHeight: 50, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: '#fff' },
  secondaryText: { fontSize: 15, fontWeight: '800' },
  success: { fontSize: 15, color: '#067647', backgroundColor: '#ecfdf3', padding: 10, borderRadius: 9 },
  error: { fontSize: 15, color: '#b42318', backgroundColor: '#fff1f0', padding: 12, borderRadius: 10 },
});
