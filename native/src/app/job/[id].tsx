import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import { getJobseekerProfile, type JobseekerJob, type JobseekerProfile } from '../../lib/jobseekerCoreApi';
import { getCandidateJob, listApplications, submitApplication } from '../../lib/applicationJourneyApi';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function salary(job: JobseekerJob) {
  if (job.salary_note) return job.salary_note;
  if (job.salary_min != null && job.salary_max != null) return `${job.salary_min.toLocaleString()}〜${job.salary_max.toLocaleString()}円`;
  if (job.salary_min != null) return `${job.salary_min.toLocaleString()}円〜`;
  return '給与は求人情報をご確認ください';
}

export default function JobDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const jobId = firstParam(params.id) ?? '';
  const [job, setJob] = useState<JobseekerJob | null>(null);
  const [profile, setProfile] = useState<JobseekerProfile | null>(null);
  const [existingApplicationId, setExistingApplicationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const [nextJob, nextProfile, applications] = await Promise.all([
        getCandidateJob(pinned.client, jobId),
        getJobseekerProfile(pinned.client),
        listApplications(pinned.client),
      ]);
      if (!pinned.isCurrent() || current !== generation.current) return;
      setJob(nextJob);
      setProfile(nextProfile);
      setExistingApplicationId(applications.find((application) => application.job_id === jobId)?.id ?? null);
    } catch (loadError) {
      if (current === generation.current) setError(String((loadError as { message?: unknown })?.message ?? loadError));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [jobId, pinCandidateAction]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const routeToApplication = (applicationId: string, documentWarning = false) => {
    setExistingApplicationId(applicationId);
    const warning = documentWarning ? '?documentWarning=1' : '';
    router.replace(`/application/${applicationId}${warning}` as never);
  };

  const reconcileAmbiguousApplication = async () => {
    try {
      const recoveryPinned = await pinCandidateAction();
      if (!recoveryPinned) return false;
      const applications = await listApplications(recoveryPinned.client);
      if (!recoveryPinned.isCurrent()) return true;
      const committed = applications.find((application) => application.job_id === jobId);
      if (!committed) return false;
      routeToApplication(committed.id);
      return true;
    } catch {
      return false;
    }
  };

  const apply = async () => {
    if (!profile) {
      setError('応募前にプロフィールを登録してください。');
      return;
    }
    if (applying || existingApplicationId) return;
    setApplying(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const result = await submitApplication(pinned.client, jobId, profile);
      if (!pinned.isCurrent()) return;
      routeToApplication(result.applicationId, result.documentHandoffFailures > 0);
    } catch (applyError) {
      // A transport error can happen after the server has already committed the
      // canonical application. Re-read the candidate's own applications before
      // showing failure or allowing another tap. This keeps process/network
      // ambiguity from becoming a second application or a false "not applied" UI.
      if (await reconcileAmbiguousApplication()) return;
      setError(String((applyError as { message?: unknown })?.message ?? applyError));
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator /><Text>求人情報を読み込んでいます…</Text></View>;
  }
  if (error && !job) {
    return <View style={styles.center}><Text style={styles.error}>{error}</Text><Pressable style={styles.secondary} onPress={() => void load()}><Text style={styles.secondaryText}>再読み込み</Text></Pressable></View>;
  }
  if (!job) return <View style={styles.center}><Text>この求人は現在確認できません。</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>{job.title}</Text>
      <Text style={styles.facility}>{job.facility_name}</Text>
      <Text style={styles.subtle}>{[job.prefecture, job.city, job.employment_type].filter(Boolean).join(' ・ ')}</Text>
      <Text style={styles.salary}>{salary(job)}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>仕事内容</Text>
        <Text style={styles.body}>{job.description || '詳細は園へお問い合わせください。'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>勤務条件</Text>
        <Text style={styles.body}>勤務時間: {job.working_hours || '未掲載'}</Text>
        <Text style={styles.body}>休日: {job.holidays || '未掲載'}</Text>
        <Text style={styles.body}>必要資格: {job.required_qualification || '未掲載'}</Text>
        <Text style={styles.body}>待遇・福利厚生: {job.benefits || '未掲載'}</Text>
      </View>

      {existingApplicationId ? (
        <Pressable style={styles.primary} onPress={() => router.push(`/application/${existingApplicationId}` as never)}>
          <Text style={styles.primaryText}>応募内容を確認</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.primary} disabled={applying} onPress={() => void apply()}>
          <Text style={styles.primaryText}>{applying ? '応募を確認中…' : 'この求人に応募する'}</Text>
        </Pressable>
      )}

      {!profile?.name?.trim() && !existingApplicationId ? (
        <Pressable style={styles.secondary} onPress={() => router.push('/(tabs)/profile')}>
          <Text style={styles.secondaryText}>プロフィールを登録する</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.secondary} onPress={() => router.push(`/visits?jobId=${encodeURIComponent(job.id)}` as never)}>
        <Text style={styles.secondaryText}>見学・体験を予約</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={() => router.push('/(tabs)/jobs')}>
        <Text style={styles.secondaryText}>求人一覧へ戻る</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 18, gap: 12, backgroundColor: '#f7f8fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 25, fontWeight: '900' },
  facility: { fontSize: 17, fontWeight: '800' },
  subtle: { color: '#606873', lineHeight: 20 },
  salary: { fontSize: 19, fontWeight: '900' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  body: { lineHeight: 22 },
  primary: { minHeight: 50, borderRadius: 13, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryText: { color: '#fff', fontWeight: '900' },
  secondary: { minHeight: 46, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryText: { fontWeight: '800' },
  error: { color: '#b42318', backgroundColor: '#fff1f0', padding: 12, borderRadius: 10 },
});