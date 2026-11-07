import { useSession } from '@clerk/expo';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import { getJobseekerProfile, listSavedJobIds, saveJob, unsaveJob, type JobseekerJob, type JobseekerProfile } from '../../lib/jobseekerCoreApi';
import { updateSavedJobAndConfirm } from '../../lib/savedJobsReadback';
import { getCandidateJob, listApplications, submitApplication } from '../../lib/applicationJourneyApi';
import { ApplyDocumentsPanel } from '../../components/ApplyDocumentsPanel';
import { usePrivateDataQuarantine } from '../../hooks/usePrivateDataQuarantine';
import { usePrivateScreenCapture } from '../../hooks/usePrivateScreenCapture';
import { candidateViewOwnerKey } from '../../lib/candidateViewOwner';
import { jobIsClosed, verifiedEvidence, type VerifiedEvidenceDisplay } from '../../lib/jobVerifiedEvidence';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

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
  return job.salary_note || range || '給与は求人情報をご確認ください';
}

/** Candidate-specific job details must never retain a former account's profile or application CTA. */
export default function JobDetailScreen() {
  usePrivateScreenCapture('job-detail');
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const jobId = firstParam(params.id) ?? '';
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  if (!ownerKey || privacy.shieldVisible || !privacy.canAccessPrivateData()) {
    return <View style={styles.center}><ActivityIndicator color="#E9265A" /></View>;
  }
  if (!jobId) return <View style={styles.center}><Text style={styles.error}>求人IDを確認できませんでした。</Text></View>;
  return <JobDetailContent key={`${ownerKey}:${jobId}`} jobId={jobId} ownerKey={ownerKey} />;
}

function VerifiedEvidenceCard({
  title, evidence, kind,
}: {
  title: string;
  evidence: VerifiedEvidenceDisplay;
  kind: 'workplace' | 'finance';
}) {
  return <View style={styles.evidenceCard}>
    <Text style={styles.evidenceTitle}>✓ {title}</Text>
    {evidence.transparencyPercent !== null
      ? <Text style={styles.subtle}>情報公開率 {evidence.transparencyPercent}%</Text> : null}
    {evidence.metrics.map((metric) => <View key={metric.key} style={styles.evidenceRow}>
      <Text style={styles.subtle}>{metric.label}</Text>
      <Text style={styles.evidenceValue}>{metric.value}</Text>
      {metric.recordCount !== null ? <Text style={styles.subtle}>
        {metric.recordCount}{kind === 'finance' ? 'か月分の記録' : '件の記録'}
      </Text> : null}
    </View>)}
    {evidence.period ? <Text style={styles.evidenceFoot}>集計期間 {evidence.period}</Text> : null}
    <Text style={styles.evidenceFoot}>{kind === 'finance'
      ? '園の申告ではなく確定した会計記録から集計'
      : '園の申告ではなく実際の勤務記録から集計'}</Text>
    {kind === 'finance' && evidence.metrics.some((metric) => metric.key === 'finance_monthly_result_stability') ? (
      <Text style={styles.evidenceFoot}>「月次収支安定性」は月次収支の推移を示す指標で、法人全体の信用力・支払能力・将来の経営継続を保証するものではありません。</Text>
    ) : null}
  </View>;
}

function JobDetailContent({ jobId, ownerKey }: { jobId: string; ownerKey: string }) {
  const router = useRouter();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [job, setJob] = useState<JobseekerJob | null>(null);
  const [profile, setProfile] = useState<JobseekerProfile | null>(null);
  const [existingApplicationId, setExistingApplicationId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[] | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const favoriteMutation = useRef(false);
  const focusActive = useRef(false);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  // この求人に応募する → this job's documents (ApplyDocumentsPanel) → submit with the chosen documents.
  const [choosingDocuments, setChoosingDocuments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    setJob(null);
    setProfile(null);
    setExistingApplicationId(null);
    setSavedIds(null);
    setFavoriteError(null);
    setChoosingDocuments(false);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const [nextJob, nextProfile, applications, favoriteResult] = await Promise.all([
        getCandidateJob(pinned.client, jobId),
        getJobseekerProfile(pinned.client),
        listApplications(pinned.client),
        // A saved-list outage must not hide valid job details or block applications.
        listSavedJobIds(pinned.client)
          .then((ids) => ({ ids, failed: false } as const))
          .catch(() => ({ ids: null, failed: true } as const)),
      ]);
      if (!pinned.isCurrent() || !focusActive.current || current !== generation.current ||
          candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) return;
      setSavedIds(favoriteResult.ids);
      setFavoriteError(favoriteResult.failed ? '気になるの保存状態を確認できませんでした。再読み込みしてください。' : null);
      setJob(nextJob);
      setProfile(nextProfile);
      setExistingApplicationId(applications.find((application) => application.job_id === jobId)?.id ?? null);
    } catch (loadError) {
      if (current === generation.current) setError(String((loadError as { message?: unknown })?.message ?? loadError));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [jobId, ownerKey, pinCandidateAction]);

  const latestLoad = useRef(load);
  latestLoad.current = load;
  useFocusEffect(useCallback(() => {
    focusActive.current = true;
    void latestLoad.current();
    return () => {
      focusActive.current = false;
      generation.current += 1;
      setJob(null);
      setProfile(null);
      setExistingApplicationId(null);
      setSavedIds(null);
      setFavoriteError(null);
      setChoosingDocuments(false);
      setLoading(true);
    };
  }, []));

  // Web job cards expose the same heart action when expanded. Deep-linked
  // Native detail must preserve that editable flow without optimistic writes.
  const toggleSaved = async () => {
    if (!focusActive.current || favoriteMutation.current || savedIds === null || loading || !job) return;
    const requestGeneration = generation.current;
    const shouldSave = !savedIds.includes(jobId);
    favoriteMutation.current = true;
    setFavoriteBusy(true);
    setFavoriteError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() ||
          candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey ||
          !focusActive.current || requestGeneration !== generation.current) return;
      const confirmedIds = await updateSavedJobAndConfirm(
        jobId, shouldSave,
        () => shouldSave ? saveJob(pinned.client, jobId) : unsaveJob(pinned.client, jobId),
        () => listSavedJobIds(pinned.client),
      );
      if (!pinned.isCurrent() || !focusActive.current ||
          requestGeneration !== generation.current) return;
      setSavedIds(confirmedIds);
    } catch {
      if (focusActive.current && requestGeneration === generation.current) {
        // The RPC may have committed even if its acknowledgement was lost.
        // Quarantine the heart until an explicit canonical re-read.
        setSavedIds(null);
        setFavoriteError('保存状況を確認できませんでした。再読み込みしてご確認ください。');
      }
    } finally {
      favoriteMutation.current = false;
      setFavoriteBusy(false);
      // A focus refresh may have raced with the mutation: reread after it settles.
      if (focusActive.current && requestGeneration !== generation.current) {
        void latestLoad.current();
      }
    }
  };

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

  const startApply = () => {
    if (!profile?.name?.trim()) {
      setError('応募前にプロフィールを登録してください。');
      return;
    }
    if (applying || existingApplicationId) return;
    if (!job || job.is_external || job.can_apply_direct === false || jobIsClosed(job.closing_at, Date.now())) {
      setError('この求人は現在Hoiku Colorから直接応募できません。');
      return;
    }
    setError(null);
    setChoosingDocuments(true);
  };

  const apply = async (documentIds: string[]) => {
    if (!profile) {
      setError('応募前にプロフィールを登録してください。');
      return;
    }
    if (applying || existingApplicationId) return;
    if (!job || job.is_external || job.can_apply_direct === false || jobIsClosed(job.closing_at, Date.now())) {
      setChoosingDocuments(false);
      setError('この求人は現在Hoiku Colorから直接応募できません。');
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const result = await submitApplication(pinned.client, jobId, profile, { documentIds });
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

  const closed = jobIsClosed(job.closing_at, Date.now());
  const directApply = !job.is_external && job.can_apply_direct !== false;
  const workplaceEvidence = verifiedEvidence(job.verified_workplace, 'workplace');
  const financeEvidence = verifiedEvidence(job.verified_finance, 'finance');
  const safeSourceUrl = (() => {
    try {
      if (!job.source_url) return null;
      const parsed = new URL(job.source_url);
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : null;
    } catch { return null; }
  })();

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>{job.title}</Text>
      <Text style={styles.facility}>{job.facility_name}</Text>
      <Text style={styles.subtle}>{[job.prefecture, job.city, job.employment_type].filter(Boolean).join(' ・ ')}</Text>
      <Text style={styles.salary}>{salary(job)}</Text>
      {savedIds !== null ? (
        <Pressable testID="job-detail-favorite-toggle" accessibilityRole="button"
          accessibilityLabel={savedIds.includes(jobId) ? '気になるから外す' : '気になるに保存'}
          accessibilityState={{ selected: savedIds.includes(jobId), disabled: favoriteBusy || loading }}
          disabled={favoriteBusy || loading} onPress={() => void toggleSaved()}
          style={[styles.favorite, savedIds.includes(jobId) && styles.favoriteSelected]}>
          <Text style={[styles.favoriteText, savedIds.includes(jobId) && styles.favoriteTextSelected]}>
            {favoriteBusy ? '保存を確認中…' : savedIds.includes(jobId) ? '♥ 気になるから外す' : '♡ 気になるに保存'}
          </Text>
        </Pressable>
      ) : favoriteError ? (
        <View style={styles.favoriteNotice}>
          <Text style={styles.error}>{favoriteError}</Text>
          <Pressable style={styles.secondary} accessibilityRole="button" accessibilityLabel="気になるを再読み込み"
            onPress={() => void latestLoad.current()} disabled={favoriteBusy}>
            <Text style={styles.secondaryText}>保存状況を再読み込み</Text>
          </Pressable>
        </View>
      ) : <Text style={styles.subtle}>気になるの保存状況を確認中…</Text>}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {closed ? <Text style={styles.error}>募集終了：保存履歴として求人内容を確認できます。応募はできません。</Text> : null}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>園</Text>
        <Text style={styles.body}>{job.facility_name}{job.facility_type ? `（${job.facility_type}）` : ''}</Text>
        <Text style={styles.subtle}>{job.address || [job.prefecture, job.city].filter(Boolean).join(' ') || '勤務地は詳細をご確認ください'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>条件</Text>
        <Text style={styles.body}>給与：{salary(job)}</Text>
        <Text style={styles.body}>雇用形態：{job.employment_type || '未掲載'}</Text>
        <Text style={styles.body}>勤務時間：{job.working_hours || '未掲載'}</Text>
        <Text style={styles.body}>休日：{job.holidays || '未掲載'}</Text>
        <Text style={styles.body}>応募資格：{job.required_qualification || '未掲載'}</Text>
        <Text style={styles.body}>待遇：{job.benefits || '未掲載'}</Text>
        <Text style={styles.body}>募集人数：{Number.isSafeInteger(job.number_of_positions) && job.number_of_positions >= 0 ? `${job.number_of_positions}名` : '未掲載'}</Text>
      </View>
      {workplaceEvidence || financeEvidence ? <View style={styles.card}>
        <Text style={styles.sectionTitle}>実際の働き方</Text>
        {workplaceEvidence ? <VerifiedEvidenceCard title="勤務実績" evidence={workplaceEvidence} kind="workplace" /> : null}
        {financeEvidence ? <VerifiedEvidenceCard title="会計実績" evidence={financeEvidence} kind="finance" /> : null}
      </View> : null}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>仕事内容・保育観</Text>
        <Text style={styles.body}>{job.description || '未掲載'}</Text>
      </View>

      {existingApplicationId ? (
        <Pressable style={styles.primary} onPress={() => router.push(`/application/${existingApplicationId}` as never)}>
          <Text style={styles.primaryText}>応募内容を確認</Text>
        </Pressable>
      ) : !directApply ? (
        <View style={styles.externalCard}>
          <Text style={styles.sectionTitle}>{job.source_name || '掲載元での応募'}</Text>
          <Text style={styles.subtle}>Hoiku Colorから直接応募できない求人です。掲載元で最新情報と応募方法をご確認ください。</Text>
          {safeSourceUrl ? <Pressable style={styles.primary} accessibilityRole="link" onPress={() => void Linking.openURL(safeSourceUrl)}>
            <Text style={styles.primaryText}>{job.source_kind === 'hellowork' ? 'ハローワークで応募方法を確認' : '掲載元で応募方法を確認'}</Text>
          </Pressable> : null}
          {job.source_name ? <Text style={styles.subtle}>出典：{job.source_name}{job.source_job_id ? `（求人番号 ${job.source_job_id}）` : ''}</Text> : null}
        </View>
      ) : closed ? (
        <Text style={styles.subtle}>募集は終了しています。</Text>
      ) : choosingDocuments ? (
        <ApplyDocumentsPanel jobId={job.id} submitting={applying} onCancel={() => setChoosingDocuments(false)} onSubmit={(documentIds) => void apply(documentIds)} />
      ) : (
        <Pressable style={styles.primary} disabled={applying} onPress={startApply}>
          <Text style={styles.primaryText}>{applying ? '応募を確認中…' : 'この求人に応募する'}</Text>
        </Pressable>
      )}

      {directApply && !closed && !profile?.name?.trim() && !existingApplicationId ? (
        <Pressable style={styles.secondary} onPress={() => router.push('/(tabs)/profile')}>
          <Text style={styles.secondaryText}>プロフィールを登録する</Text>
        </Pressable>
      ) : null}

      {directApply && !closed ? (
        <Pressable style={styles.secondary} onPress={() => router.push(`/visits?jobId=${encodeURIComponent(job.id)}` as never)}>
          <Text style={styles.secondaryText}>見学・体験を予約</Text>
        </Pressable>
      ) : null}
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
  favorite: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#E9265A', backgroundColor: '#FFFFFF', paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  favoriteSelected: { backgroundColor: '#FFF0F4' },
  favoriteText: { color: '#B72552', fontSize: 15, fontWeight: '800' },
  favoriteTextSelected: { color: '#99193E' },
  favoriteNotice: { gap: 8 },
  subtle: { color: '#606873', lineHeight: 20 },
  salary: { fontSize: 19, fontWeight: '900' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8 },
  evidenceCard: { borderWidth: 1, borderColor: '#F5DCE4', borderRadius: 14, padding: 12, gap: 8, backgroundColor: '#FFF8FA' },
  evidenceTitle: { fontSize: 17, fontWeight: '900', color: '#AA1F49' },
  evidenceRow: { borderRadius: 10, padding: 10, gap: 3, backgroundColor: '#fff' },
  evidenceValue: { fontSize: 19, fontWeight: '900', color: '#24212A' },
  evidenceFoot: { color: '#606873', fontSize: 12, lineHeight: 18 },
  externalCard: { backgroundColor: '#fff8e6', borderRadius: 16, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  body: { lineHeight: 22 },
  primary: { minHeight: 50, borderRadius: 13, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryText: { color: '#fff', fontWeight: '900' },
  secondary: { minHeight: 46, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryText: { fontWeight: '800' },
  error: { color: '#b42318', backgroundColor: '#fff1f0', padding: 12, borderRadius: 10 },
});