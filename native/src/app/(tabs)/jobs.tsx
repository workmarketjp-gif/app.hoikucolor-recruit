import { useSession } from '@clerk/expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import { usePrivateDataQuarantine } from '../../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey, readCandidateOwnedView, type CandidateOwnedView } from '../../lib/candidateViewOwner';
import {
  listSavedJobIds,
  getJobSearchFacets,
  saveJob,
  searchJobseekerJobs,
  unsaveJob,
  type JobSearchCursor,
  type JobSearchFacets,
  type JobseekerJob,
} from '../../lib/jobseekerCoreApi';
import { EMPTY_JOB_SEARCH_FILTERS, createJobSearchQuery, hasActiveJobFilters, type JobSearchFilterCriteria } from '../../lib/jobSearchFilterCriteria';
import { updateSavedJobAndConfirm } from '../../lib/savedJobsReadback';
import { shouldRefreshJobsOnReturn, type JobSearchFocusState } from '../../lib/jobSearchFocus';

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
  // Web searches as the user types (250 ms debounce). Invalidate the old
  // result generation immediately so a late response cannot paint a different
  // keyword's jobs while the user is still typing.
  const editQuery = (value: string) => {
    if (!ownerKey || !privateAllowed || privacy.shieldVisible) return;
    setOwnedQuery({ ownerKey, value });
    if (keywordTimer.current) clearTimeout(keywordTimer.current);
    generation.current += 1;
    setOwnedJobs(null);
    setOwnedSavedIds(null);
    setOwnedError(null);
    setCursor(null);
    setHasMore(false);
    setTotalCount(0);
    setLoading(true);
    keywordTimer.current = setTimeout(() => {
      keywordTimer.current = null;
      void load(true, value, filters);
    }, value.trim() ? 250 : 0);
  };
  const [ownedFilters, setOwnedFilters] = useState<CandidateOwnedView<JobSearchFilterCriteria> | null>(null);
  const filters = readCandidateOwnedView(ownedFilters, ownerKey, privateAllowed) ?? EMPTY_JOB_SEARCH_FILTERS;
  const [ownedFacets, setOwnedFacets] = useState<CandidateOwnedView<JobSearchFacets> | null>(null);
  const facets = readCandidateOwnedView(ownedFacets, ownerKey, privateAllowed);
  const [ownedFacetError, setOwnedFacetError] = useState<CandidateOwnedView<string> | null>(null);
  const facetError = readCandidateOwnedView(ownedFacetError, ownerKey, privateAllowed);
  const [picker, setPicker] = useState<'prefecture' | 'employment' | null>(null);
  const facetGeneration = useRef(0);
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
  const keywordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutationBusyRef = useRef(false);
  const mutationSequence = useRef(0);
  const focusActive = useRef(false);
  const lastFocus = useRef<JobSearchFocusState>({ ownerKey: null, hasBlurred: false });

  const cancelKeywordTimer = () => {
    if (keywordTimer.current) clearTimeout(keywordTimer.current);
    keywordTimer.current = null;
  };

  const loadFacets = useCallback(async () => {
    const current = ++facetGeneration.current;
    setOwnedFacets(null);
    setOwnedFacetError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) {
        throw new Error('絞り込み条件を確認できませんでした。');
      }
      const next = await getJobSearchFacets(pinned.client);
      if (!pinned.isCurrent() || current !== facetGeneration.current || privacy.shieldVisible || !ownerKey) return;
      setOwnedFacets({ ownerKey, value: next });
    } catch {
      if (current === facetGeneration.current && ownerKey && !privacy.shieldVisible) {
        setOwnedFacetError({ ownerKey, value: '絞り込み条件を読み込めませんでした。' });
      }
    }
  }, [ownerKey, pinCandidateAction, privacy.shieldVisible]);

  const load = useCallback(async (reset: boolean, requestedQuery = query, requestedFilters = filters) => {
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
          ...createJobSearchQuery(requestedQuery, requestedFilters),
          limit: 24,
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
  }, [cursor, ownerKey, pinCandidateAction, query, filters, savedIds, visibleJobs]);

  // The screen remains mounted under other tabs and the job detail stack.
  // Keep the latest filters/query when navigating back, but do not present
  // any old results until both search and bookmark readback succeed.
  // A ref avoids linking navigation focus to load's result-dependent callback
  // (which would otherwise trigger a repeated RPC on each state update).
  const latestLoad = useRef(load);
  latestLoad.current = load;
  const latestPrivateState = useRef({ allowed: privateAllowed, shieldVisible: privacy.shieldVisible });
  latestPrivateState.current = { allowed: privateAllowed, shieldVisible: privacy.shieldVisible };

  useFocusEffect(useCallback(() => {
    const previous = lastFocus.current;
    lastFocus.current = { ownerKey, hasBlurred: false };
    focusActive.current = true;
    if (shouldRefreshJobsOnReturn(
      previous, ownerKey, latestPrivateState.current.allowed && !latestPrivateState.current.shieldVisible,
    )) {
      cancelKeywordTimer();
      void latestLoad.current(true);
    }
    return () => {
      focusActive.current = false;
      lastFocus.current = { ownerKey, hasBlurred: true };
      cancelKeywordTimer();
      generation.current += 1;
      setOwnedJobs(null);
      setOwnedSavedIds(null);
      setOwnedError(null);
      setCursor(null);
      setHasMore(false);
      setTotalCount(0);
      setLoading(true);
    };
  }, [ownerKey]));

  // App Lock and foreground revalidation are *also* ownership boundaries.
  // Discard search drafts, results and pagination on shield entry. A fresh
  // canonical read is required after unlock; old responses cannot commit.
  useEffect(() => {
    cancelKeywordTimer();
    generation.current += 1;
    facetGeneration.current += 1;
    mutationSequence.current += 1;
    mutationBusyRef.current = false;
    setBusyJobId(null);
    setOwnedQuery(null);
    setOwnedFilters(null);
    setOwnedFacets(null);
    setOwnedFacetError(null);
    setPicker(null);
    setOwnedJobs(null);
    setOwnedSavedIds(null);
    setOwnedError(null);
    setCursor(null);
    setHasMore(false);
    setTotalCount(0);
    setLoading(true);
    if (privacy.shieldVisible || !ownerKey) {
      return () => { generation.current += 1; };
    }
    void load(true, '', EMPTY_JOB_SEARCH_FILTERS);
    void loadFacets();
    return () => {
      cancelKeywordTimer();
      generation.current += 1;
      facetGeneration.current += 1;
      mutationSequence.current += 1;
    };
  }, [ownerKey, privacy.shieldVisible]);

  const selectFilter = (patch: Partial<JobSearchFilterCriteria>) => {
    if (!ownerKey || !privateAllowed || privacy.shieldVisible) return;
    cancelKeywordTimer();
    const next = { ...filters, ...patch };
    setOwnedFilters({ ownerKey, value: next });
    setPicker(null);
    void load(true, query, next);
  };
  const clearFilters = () => {
    if (!ownerKey || !privateAllowed || privacy.shieldVisible) return;
    cancelKeywordTimer();
    setOwnedQuery(null);
    setOwnedFilters(null);
    setPicker(null);
    void load(true, '', EMPTY_JOB_SEARCH_FILTERS);
  };

  const toggleSaved = async (jobId: string) => {
    if (!privateAllowed || !ownerKey || privacy.shieldVisible || loading ||
        savedIds === null || mutationBusyRef.current ||
        !jobs.some((job) => job.id === jobId)) return;
    mutationBusyRef.current = true;
    const requestGeneration = generation.current;
    const attempt = ++mutationSequence.current;
    setBusyJobId(jobId);
    setOwnedError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) {
        throw new Error('安全なログイン状態を確認できませんでした。');
      }
      const shouldBeSaved = !savedIds.includes(jobId);
      const canonical = await updateSavedJobAndConfirm(jobId, shouldBeSaved,
        () => shouldBeSaved ? saveJob(pinned.client, jobId) : unsaveJob(pinned.client, jobId),
        () => listSavedJobIds(pinned.client));
      if (!pinned.isCurrent() || attempt !== mutationSequence.current ||
          requestGeneration !== generation.current || privacy.shieldVisible) return;
      setOwnedSavedIds({ ownerKey, value: canonical });
    } catch {
      if (attempt === mutationSequence.current && requestGeneration === generation.current &&
          ownerKey && !privacy.shieldVisible) {
        // A write can succeed while its acknowledgement/readback fails. Never
        // present a guessed bookmark state or allow a second toggle until reload.
        setOwnedSavedIds(null);
        setOwnedError({ ownerKey, value: '保存状況を確認できませんでした。再検索してご確認ください。' });
      }
    } finally {
      if (attempt === mutationSequence.current) {
        mutationBusyRef.current = false;
        setBusyJobId(null);
        // If a save/unsave settled after the tab was left and revisited, the
        // earlier focus read may predate the write. Verify canonical state again.
        if (focusActive.current && requestGeneration !== generation.current && ownerKey &&
            latestPrivateState.current.allowed && !latestPrivateState.current.shieldVisible) {
          cancelKeywordTimer();
          void latestLoad.current(true);
        }
      }
    }
  };



  // Never render a private result (or its editor) beneath a privacy shield.
  if (!ownerKey || !privateAllowed || privacy.shieldVisible) {
    return <View testID="jobs-private-shield" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF8FA' }}><ActivityIndicator color="#FF2F5F" /></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.searchCard}>
        <TextInput
          testID="job-search-keyword"
          value={query}
          onChangeText={editQuery}
          placeholder="園名・職種・地域で検索"
          returnKeyType="search"
          onSubmitEditing={() => { cancelKeywordTimer(); void load(true, query); }}
          style={styles.input}
        />
        <View style={styles.filterRow}>
          <Pressable testID="job-filter-prefecture" accessibilityRole="button" style={[styles.filterChip, Boolean(filters.prefecture) && styles.filterChipActive]} onPress={() => setPicker('prefecture')}>
            <Text style={styles.filterChipText}>{filters.prefecture || '勤務地'} ▾</Text>
          </Pressable>
          <Pressable testID="job-filter-employment" accessibilityRole="button" style={[styles.filterChip, Boolean(filters.employmentType) && styles.filterChipActive]} onPress={() => setPicker('employment')}>
            <Text style={styles.filterChipText}>{filters.employmentType || '雇用形態'} ▾</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: filters.hoVerifiedOnly }} style={[styles.filterChip, filters.hoVerifiedOnly && styles.filterChipActive]} onPress={() => selectFilter({ hoVerifiedOnly: !filters.hoVerifiedOnly })}>
            <Text style={styles.filterChipText}>勤務実績データあり</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: filters.hfVerifiedOnly }} style={[styles.filterChip, filters.hfVerifiedOnly && styles.filterChipActive]} onPress={() => selectFilter({ hfVerifiedOnly: !filters.hfVerifiedOnly })}>
            <Text style={styles.filterChipText}>会計実績データあり</Text>
          </Pressable>
        </View>
        {facetError ? <View style={styles.filterFailure}><Text style={styles.error}>{facetError}</Text><Pressable accessibilityRole="button" onPress={() => void loadFacets()}><Text style={styles.link}>再読み込み</Text></Pressable></View> : null}
        <Pressable testID="job-search-submit" style={styles.primaryButton} onPress={() => { cancelKeywordTimer(); void load(true, query); }} disabled={loading}>
          <Text style={styles.primaryButtonText}>検索</Text>
        </Pressable>
        <Text style={styles.subtle}>{error || loading || visibleJobs === null ? '検索中・確認待ち' : `${totalCount}件の求人`}</Text>
      </View>

      <View style={styles.resultBar}>
        <Text style={styles.resultCount}>{error || loading || visibleJobs === null ? '—' : `${totalCount}件`}</Text>
        {hasActiveJobFilters(query, filters) ? (
          <Pressable accessibilityRole="button" onPress={clearFilters}><Text style={styles.link}>条件をクリア</Text></Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => router.push('/matches' as never)}><Text style={styles.link}>マッチ度順で見る</Text></Pressable>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && jobs.length === 0 ? <ActivityIndicator /> : null}
      {!loading && !error && visibleJobs !== null && jobs.length === 0 ? (
        <View style={styles.noResults}><Text style={styles.noResultsTitle}>条件に合う求人はありません</Text><Text style={styles.subtle}>条件を変えて、もう一度探してみてください。</Text></View>
      ) : null}

      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          saved={savedIds?.includes(job.id) === true}
          busy={busyJobId !== null || savedIds === null || !privateAllowed || loading}
          onToggleSaved={() => void toggleSaved(job.id)}
          onOpen={() => router.push(`/job/${job.id}` as never)}
        />
      ))}

      {hasMore && visibleJobs !== null ? (
        <Pressable style={styles.secondaryButtonWide} disabled={loading} onPress={() => void load(false)}>
          {loading ? <ActivityIndicator /> : <Text style={styles.secondaryButtonText}>さらに見る（{Math.min(jobs.length, totalCount)}/{totalCount}件）</Text>}
        </Pressable>
      ) : null}
      <Modal transparent animationType="slide" visible={picker !== null} onRequestClose={() => setPicker(null)}>
        <View style={styles.modalLayer}>
          <Pressable accessibilityLabel="選択を閉じる" style={styles.modalBackdrop} onPress={() => setPicker(null)} />
          <View style={styles.modalPanel}>
            <Text style={styles.modalTitle}>{picker === 'prefecture' ? '勤務地' : '雇用形態'}</Text>
            <ScrollView style={styles.modalOptions} keyboardShouldPersistTaps="handled">
              {!facets ? <Text style={styles.subtle}>絞り込み条件を確認しています。読み込めない場合は再読み込みしてください。</Text> : null}
              {['', ...new Set((picker === 'prefecture' ? facets?.prefectures ?? [] : facets?.employmentTypes ?? []).filter(Boolean))].map((value) => (
                <Pressable key={value || 'all'} accessibilityRole="button" style={styles.modalOption} onPress={() => selectFilter(picker === 'prefecture' ? { prefecture: value } : { employmentType: value })}>
                  <Text style={styles.modalOptionText}>{value || '指定しない'}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable accessibilityRole="button" style={styles.modalClose} onPress={() => setPicker(null)}><Text style={styles.modalCloseText}>閉じる</Text></Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, backgroundColor: '#FFF8FA' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: '#E4D4DA', backgroundColor: '#fff', justifyContent: 'center' },
  filterChipActive: { borderColor: '#E9265A', backgroundColor: '#FFF0F4' },
  filterChipText: { fontSize: 14, color: '#34222B', fontWeight: '800' },
  filterFailure: { gap: 8 },
  noResults: { padding: 20, borderRadius: 14, backgroundColor: '#fff', gap: 8 },
  noResultsTitle: { fontSize: 17, fontWeight: '800', color: '#34222B' },
  modalLayer: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0008' },
  modalPanel: { maxHeight: '70%', padding: 20, paddingBottom: 32, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#34222B' },
  modalOptions: { flexGrow: 0 },
  modalOption: { minHeight: 48, justifyContent: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F5EBEF' },
  modalOptionText: { fontSize: 16, color: '#34222B', fontWeight: '700' },
  modalClose: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9265A', borderRadius: 12 },
  modalCloseText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  searchCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  resultBar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  resultCount: { fontSize: 16, fontWeight: '800' },
  input: { borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  primaryButton: { minHeight: 46, borderRadius: 12, backgroundColor: '#E9265A', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
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
