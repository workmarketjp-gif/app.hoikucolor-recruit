import { useSession } from '@clerk/expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { usePrivateDataQuarantine } from '../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey } from '../lib/candidateViewOwner';
import { listSavedJobIds, saveJob, searchJobseekerJobs, unsaveJob, type JobseekerJob } from '../lib/jobseekerCoreApi';
import { updateSavedJobAndConfirm } from '../lib/savedJobsReadback';
import { homeEvidenceMetrics, homeJobAvailability, homeJobConditions, homeJobSource } from '../lib/homeFeaturedDetails';
import { homeFeaturedSalary } from '../lib/homeFeaturedSalary';
import { homeVerifiedDisclosure } from '../lib/homeVerifiedDisclosure';
import { isExplicitlyDirectJob } from '../lib/homeApplyDecision';

/** The Web's three canonical featured jobs; never a cached or cross-account list. */
export function FeaturedHomeJobs() {
  const { session } = useSession();
  const router = useRouter();
  const privacy = usePrivateDataQuarantine();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const allowed = Boolean(ownerKey) && !privacy.shieldVisible && privacy.canAccessPrivateData();
  const generation = useRef(0);
  const [snapshot, setSnapshot] = useState<{ ownerKey: string; jobs: JobseekerJob[]; savedIds: string[] | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  const favoriteMutation = useRef(false);
  const [retry, setRetry] = useState(0);

  useFocusEffect(useCallback(() => {
    const request = ++generation.current;
    setSnapshot(null);
    setError(null);
    setFavoriteError(null);
    setFavoriteBusyId(null);
    setExpandedId(null);
    if (allowed && ownerKey) {
      void (async () => {
        try {
          const pinned = await pinCandidateAction();
          if (!pinned?.isCurrent() ||
              candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) {
            throw new Error('ログイン状態を確認できませんでした。');
          }
          // A bookmark read error must not suppress valid job details or imply 'not saved'.
          const [page, savedResult] = await Promise.all([
            searchJobseekerJobs(pinned.client, { limit: 3 }),
            listSavedJobIds(pinned.client).then((ids) => ({ ids, failed: false } as const))
              .catch(() => ({ ids: null, failed: true } as const)),
          ]);
          if (request === generation.current && pinned.isCurrent() && privacy.canAccessPrivateData()) {
            setSnapshot({ ownerKey, jobs: page.jobs, savedIds: savedResult.ids });
            if (savedResult.failed) {
              setFavoriteError('気になるの保存状態を確認できませんでした。再読み込みしてください。');
            }
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

  const toggleFavorite = async (jobId: string) => {
    const confirmed = snapshot?.ownerKey === ownerKey ? snapshot.savedIds : null;
    if (!allowed || !ownerKey || confirmed === null || favoriteMutation.current ||
        !snapshot?.jobs.some((job) => job.id === jobId)) return;
    const shouldSave = !confirmed.includes(jobId);
    const request = generation.current;
    favoriteMutation.current = true;
    setFavoriteBusyId(jobId);
    setFavoriteError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() ||
          candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey ||
          request !== generation.current) return;
      // Never optimistically flip the heart. Both the RPC and the server's
      // canonical saved-ID list must agree for this specific candidate.
      const ids = await updateSavedJobAndConfirm(
        jobId, shouldSave,
        () => shouldSave ? saveJob(pinned.client, jobId) : unsaveJob(pinned.client, jobId),
        () => listSavedJobIds(pinned.client),
      );
      if (!pinned.isCurrent() || request !== generation.current ||
          !privacy.canAccessPrivateData() || privacy.shieldVisible) return;
      setSnapshot((previous) => previous?.ownerKey === ownerKey
        ? { ...previous, savedIds: ids } : previous);
    } catch {
      if (request === generation.current && privacy.canAccessPrivateData() && !privacy.shieldVisible) {
        // Ambiguous network acknowledgements can mean the RPC committed.
        // Disable further writes until a fresh canonical read resolves it.
        setSnapshot((previous) => previous?.ownerKey === ownerKey
          ? { ...previous, savedIds: null } : previous);
        setFavoriteError('保存状況を確認できませんでした。再読み込みしてご確認ください。');
      }
    } finally {
      favoriteMutation.current = false;
      if (request === generation.current) {
        setFavoriteBusyId(null);
      } else if (allowed) {
        // A focus/read refresh raced with a write. Refresh after it settles.
        setRetry((value) => value + 1);
      }
    }
  };

  // A stale A-session result is NEVER painted during B-session or App Lock.
  const jobs = allowed && ownerKey && snapshot?.ownerKey === ownerKey ? snapshot.jobs : null;
  const savedIds = allowed && ownerKey && snapshot?.ownerKey === ownerKey ? snapshot.savedIds : null;
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
      {favoriteError && !error && <View style={styles.block}>
        <Text style={styles.error}>{favoriteError}</Text>
        <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}>
          <Text style={styles.link}>保存状況を再読み込み</Text>
        </Pressable>
      </View>}
      {!error && jobs === null && <ActivityIndicator accessibilityLabel="おすすめ求人を読み込み中" color="#CC1A3D" />}
      {!error && jobs?.length === 0 && <Text style={styles.subtle}>現在、表示できる求人はありません。</Text>}
      {!error && jobs?.map((job) => {
        const expanded = expandedId === job.id;
        const isSaved = savedIds?.includes(job.id) ?? false;
        const availability = homeJobAvailability(job, Date.now());
        const workplaceMetrics = homeEvidenceMetrics(job.verified_workplace, 'workplace');
        const financeMetrics = homeEvidenceMetrics(job.verified_finance, 'finance');
        const workplaceEvidence = homeVerifiedDisclosure(job.verified_workplace, 'workplace', workplaceMetrics);
        const financeEvidence = homeVerifiedDisclosure(job.verified_finance, 'finance', financeMetrics);
        return <View key={job.id} style={styles.job}>
          <Text style={styles.jobTitle}>{job.title}</Text>
          <Text style={styles.facility}>{job.facility_name}</Text>
          {savedIds !== null ? <Pressable accessibilityRole="button"
            accessibilityLabel={isSaved ? '気になるから外す' : '気になるに保存'}
            accessibilityState={{ selected: isSaved, disabled: favoriteBusyId !== null }}
            disabled={favoriteBusyId !== null}
            style={[styles.favorite, isSaved && styles.favoriteSelected]}
            onPress={() => void toggleFavorite(job.id)}>
            <Text style={[styles.favoriteText, isSaved && styles.favoriteTextSelected]}>
              {favoriteBusyId === job.id ? '保存を確認中…' : isSaved ? '♥ 気になるから外す' : '♡ 気になるに保存'}
            </Text>
          </Pressable> : !favoriteError ? <Text style={styles.subtle}>気になるの保存状況を確認中…</Text> : null}
          <Text style={styles.subtle}>{[job.prefecture, job.city, job.employment_type].filter(Boolean).join(' ・ ')}</Text>
          <Text style={styles.salary}>{homeFeaturedSalary(job)}</Text>
          {job.is_external && job.source_name ? <Text style={styles.badge}>掲載元：{job.source_name}</Text> : null}
          {(workplaceEvidence || financeEvidence) && <View style={styles.evidenceTags}>
            {workplaceEvidence && <Text style={styles.evidenceTag}>{workplaceEvidence.label}</Text>}
            {financeEvidence && <Text style={styles.financeTag}>{financeEvidence.label}</Text>}
          </View>}
          {availability === 'closed' && <Text style={styles.error}>募集終了</Text>}
          {availability === 'unknown' && <Text style={styles.error}>募集状況を確認できません</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={styles.button}
            onPress={() => setExpandedId(expanded ? null : job.id)}>
            <Text style={styles.buttonText}>{expanded ? '閉じる' : '詳しく見る'}</Text>
          </Pressable>
          {expanded && <View style={styles.block}>
            {homeJobConditions(job).map(({ label, value }) => <Text key={label} style={styles.detail}>{label}：{value}</Text>)}
            {job.description?.trim() ? <Text style={styles.detail}>{job.description}</Text> : null}
            {[
              { evidence: workplaceEvidence, metrics: workplaceMetrics },
              { evidence: financeEvidence, metrics: financeMetrics },
            ].map(({ evidence, metrics }) => evidence && <View key={evidence.label} style={styles.evidencePanel}>
              <Text style={styles.evidenceTitle}>{evidence.label}</Text>
              {evidence.transparency && <Text style={styles.subtle}>{evidence.transparency}</Text>}
              {metrics.map((metric) => <View key={metric.key} style={styles.block}>
                <Text style={styles.detail}>{metric.label}：{metric.displayValue}</Text>
                {metric.sample && <Text style={styles.subtle}>{metric.sample}</Text>}
              </View>)}
              <Text style={styles.subtle}>{[evidence.period, evidence.attribution].filter(Boolean).join(' ・ ')}</Text>
              {evidence.stabilityCaution && <Text style={styles.subtle}>{evidence.stabilityCaution}</Text>}
            </View>)}
            {homeJobSource(job).map((label) => <Text key={label} style={styles.subtle}>{label}</Text>)}
            {job.is_external === false && availability === 'open' && <Pressable accessibilityRole="button" style={styles.button}
              onPress={() => router.push(`/visits?jobId=${encodeURIComponent(job.id)}` as never)}>
              <Text style={styles.buttonText}>見学・体験を予約</Text>
            </Pressable>}
          </View>}
          {isExplicitlyDirectJob(job) && availability === 'open' ? (
            <Pressable accessibilityRole="button" style={styles.primary}
              accessibilityLabel={`${job.facility_name}の求人に応募する`}
              onPress={() => {
                if (!privacy.canAccessPrivateData() || privacy.shieldVisible) return;
                // Navigation only. Job detail re-reads the canonical job, profile,
                // applications and durable pending receipt before selection.
                router.push(`/job/${encodeURIComponent(job.id)}?apply=1` as never);
              }}>
              <Text style={styles.primaryText}>応募する</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" style={styles.button}
            onPress={() => router.push(`/job/${encodeURIComponent(job.id)}` as never)}>
            <Text style={styles.buttonText}>求人詳細を見る</Text>
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
  evidenceTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  evidenceTag: { overflow: 'hidden', color: '#146149', backgroundColor: '#E8F7F0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, fontSize: 13, fontWeight: '800' },
  financeTag: { overflow: 'hidden', color: '#66448D', backgroundColor: '#F4EDFC', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, fontSize: 13, fontWeight: '800' },
  evidencePanel: { borderRadius: 12, borderWidth: 1, borderColor: '#F1DFE7', padding: 12, gap: 7 },
  evidenceTitle: { color: '#30212B', fontSize: 15, fontWeight: '800' },
  favorite: { minHeight: 46, borderWidth: 1, borderColor: '#E8C6D1', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  favoriteSelected: { backgroundColor: '#FFF0F4', borderColor: '#CC1A3D' },
  favoriteText: { color: '#602738', fontSize: 15, fontWeight: '800' },
  favoriteTextSelected: { color: '#A3163C' },
  error: { fontSize: 14, lineHeight: 21, color: '#9D1734' },
  block: { gap: 8 },
  detail: { fontSize: 14, lineHeight: 24, color: '#2A202A' },
  button: { minHeight: 46, borderWidth: 1, borderColor: '#E8C6D1', borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 10 },
  buttonText: { color: '#602738', fontSize: 15, fontWeight: '800' },
  primary: { minHeight: 48, borderRadius: 12, backgroundColor: '#CC1A3D', alignItems: 'center', justifyContent: 'center', padding: 10 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
