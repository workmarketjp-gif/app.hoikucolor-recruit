import { useSession } from '@clerk/expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import { CandidateTabIcon } from '../../components/CandidateTabIcon';
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
import { jobSearchFailureChannel } from '../../lib/jobSearchFailureChannel';
import { organicJobRankLabels, type OrganicJobRankLabel } from '../../lib/jobRankingDisclosure';
import { jobSearchCardPresentation } from '../../lib/jobSearchCardPresentation';
import { keywordForCurrentCandidate, type CandidateKeywordDraft } from '../../lib/jobSearchKeywordDraft';

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
  rank,
  saved,
  busy,
  onToggleSaved,
  onOpen,
}: {
  key?: string;
  job: JobseekerJob;
  rank: OrganicJobRankLabel;
  saved: boolean;
  busy: boolean;
  onToggleSaved: () => void;
  onOpen: () => void;
}) {
  const summary = jobSearchCardPresentation(job);
  return (
    <View style={styles.jobCard}>
      <Text style={styles.rankLabel} accessibilityLabel={rank.ariaLabel}>{rank.text}</Text>
      <View style={styles.jobHead}>
        <View style={styles.jobIdentity}>
          <Text style={styles.facility}>{job.facility_name}</Text>
          <Text style={styles.jobTitle}>{job.title}</Text>
        </View>
        <Pressable testID="job-search-save-heart" accessibilityRole="button"
          accessibilityLabel={saved ? '気になるから外す' : '気になるに保存'}
          accessibilityState={{ selected: saved, disabled: busy }}
          disabled={busy} onPress={onToggleSaved}
          style={[styles.saveHeart, saved && styles.saveHeartActive]}>
          <CandidateTabIcon name="heart" color={saved ? '#E9265A' : '#74616B'} />
        </Pressable>
      </View>
      <Text style={styles.salary}>{salary(job)}</Text>
      <Text style={styles.meta}>{summary.location}</Text>
      <View style={styles.badges}>
        {summary.isClosed ? <Text style={styles.badgeClosed}>募集終了</Text> : null}
        {summary.hasVerifiedWorkplace ? <Text style={styles.badgeVerified}>✓ 勤務実績あり</Text> : null}
        {summary.hasVerifiedFinance ? <Text style={styles.badgeFinance}>✓ 会計実績あり</Text> : null}
        {job.is_external && job.source_name ? <Text style={styles.badge}>{job.source_name}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={onOpen}>
        <Text style={styles.primaryButtonText}>{summary.isClosed ? '募集終了・詳細を見る' : job.is_external ? '求人の詳細を見る' : '詳細・応募を見る'}</Text>
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
  // Keep the latest TextInput event synchronously, before a React state render.
  // Never reuse another session's draft on account switch.
  const keywordDraftRef = useRef<CandidateKeywordDraft>({ ownerKey, value: query });
  if (keywordDraftRef.current.ownerKey !== ownerKey) {
    keywordDraftRef.current = { ownerKey, value: query };
  }
  // Web searches as the user types (250 ms debounce). Invalidate the old
  // result generation immediately so a late response cannot paint a different
  // keyword's jobs while the user is still typing.
  const editQuery = (value: string) => {
    if (!ownerKey || !privateAllowed || privacy.shieldVisible) return;
    keywordDraftRef.current = { ownerKey, value };
    setOwnedQuery({ ownerKey, value });
    if (keywordTimer.current) clearTimeout(keywordTimer.current);
    generation.current += 1;
    setOwnedJobs(null);
    setOwnedSavedIds(null);
    setOwnedError(null);
    setOwnedPageError(null);
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
  // The Web rank is the current visible organic position, never a fabricated
  // matching score or inferred verified status.
  const rankLabels = organicJobRankLabels(jobs.map((job) => job.id));
  const [cursor, setCursor] = useState<JobSearchCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [ownedError, setOwnedError] = useState<CandidateOwnedView<string> | null>(null);
  const error = readCandidateOwnedView(ownedError, ownerKey, privateAllowed);
  const [ownedPageError, setOwnedPageError] = useState<CandidateOwnedView<string> | null>(null);
  const pageError = readCandidateOwnedView(ownedPageError, ownerKey, privateAllowed);
  const generation = useRef(0);
  const keywordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutationBusyRef = useRef(false);
  const mutationSequence = useRef(0);
  const focusActive = useRef(false);
  const lastFocus = useRef<JobSearchFocusState>({ ownerKey: null, hasBlurred: false });
  const latestOwnerRef = useRef(ownerKey);
  latestOwnerRef.current = ownerKey;

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
    setOwnedPageError(null);
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
    } catch {
      const channel = jobSearchFailureChannel({
        reset, owner: ownerKey, requestedOwner: latestOwnerRef.current,
        requestGeneration: currentGeneration, currentGeneration: generation.current,
        privateAllowed: latestPrivateState.current.allowed && !latestPrivateState.current.shieldVisible,
        hasConfirmedResults: visibleJobs !== null, hasConfirmedBookmarks: savedIds !== null,
      });
      if (channel === 'pagination' && ownerKey) {
        setOwnedPageError({ ownerKey, value: '次の求人を読み込めませんでした。表示中の求人はそのままです。' });
      } else if (channel === 'initial' && ownerKey) {
        setOwnedError({ ownerKey, value: '求人を検索できませんでした。もう一度お試しください。' });
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
      setOwnedPageError(null);
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
    keywordDraftRef.current = { ownerKey, value: '' };
    setOwnedQuery(null);
    setOwnedFilters(null);
    setOwnedFacets(null);
    setOwnedFacetError(null);
    setPicker(null);
    setOwnedJobs(null);
    setOwnedSavedIds(null);
    setOwnedError(null);
    setOwnedPageError(null);
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
    void load(true, keywordForCurrentCandidate(ownerKey, keywordDraftRef.current, query), next);
  };
  const clearFilters = () => {
    if (!ownerKey || !privateAllowed || privacy.shieldVisible) return;
    cancelKeywordTimer();
    keywordDraftRef.current = { ownerKey, value: '' };
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
          onSubmitEditing={() => { cancelKeywordTimer(); void load(true, keywordForCurrentCandidate(ownerKey, keywordDraftRef.current, query)); }}
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
        <Pressable testID="job-search-submit" style={styles.primaryButton} onPress={() => { cancelKeywordTimer(); void load(true, keywordForCurrentCandidate(ownerKey, keywordDraftRef.current, query)); }} disabled={loading}>
          <Text style={styles.primaryButtonText}>検索</Text>
        </Pressable>
        <Text style={styles.subtle}>{error ? '求人を検索できませんでした' : visibleJobs === null ? '検索中…' : `${totalCount}件の求人`}</Text>
      </View>

      <View style={styles.resultBar}>
        <Text style={styles.resultCount}>{error || visibleJobs === null ? '—' : `${totalCount}件`}</Text>
        {hasActiveJobFilters(query, filters) ? (
          <Pressable accessibilityRole="button" onPress={clearFilters}><Text style={styles.link}>条件をクリア</Text></Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => router.push('/matches' as never)}><Text style={styles.link}>マッチ度順で見る</Text></Pressable>
        )}
      </View>

      <View style={styles.rankingBox}>
        <Pressable accessibilityRole="button" accessibilityLabel="求人の表示順について"
          accessibilityState={{ expanded: rankingOpen }} style={styles.rankingToggle}
          onPress={() => setRankingOpen((value) => !value)}>
          <Text style={styles.rankingHeadline}>表示順について</Text>
          <Text style={styles.rankingSummary}>情報公開を優先したオーガニック表示です {rankingOpen ? '▲' : '▼'}</Text>
        </Pressable>
        {rankingOpen ? <View style={styles.rankingTextGroup}>
          <Text style={styles.rankingDetail}>現在は有料の上位表示を適用していません。勤務実績・会計実績の確認状況、情報公開率、公開日時の順で表示します。園の申告内容を確認済みの実績として扱うことはありません。</Text>
          <Text style={styles.rankingDetail}>検索で絞り込んだ場合の番号は、絞り込み後の表示順です。Google求人などから特定求人を開いた場合は「指定求人」と明示します。将来、有料枠を導入する場合は「PR」と明示し、オーガニック評価と分離します。</Text>
        </View> : null}
      </View>

      {error ? (
        <View testID="job-search-error-state" style={styles.filterFailure}>
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <Pressable testID="job-search-retry" accessibilityRole="button"
            accessibilityLabel="求人検索を再試行" style={styles.secondaryButtonWide}
            disabled={loading} onPress={() => { cancelKeywordTimer(); void load(true, query, filters); }}>
            <Text style={styles.secondaryButtonText}>再試行</Text>
          </Pressable>
        </View>
      ) : null}
      {loading && jobs.length === 0 ? <ActivityIndicator /> : null}
      {!loading && !error && visibleJobs !== null && jobs.length === 0 ? (
        <View testID="job-search-empty-state" style={styles.noResults}>
          <Text style={styles.noResultsTitle}>条件に合う求人はありません</Text>
          <Text style={styles.subtle}>条件を変えて、もう一度探してみてください。</Text>
          {hasActiveJobFilters(query, filters) ? (
            <Pressable testID="job-search-empty-clear" accessibilityRole="button"
              accessibilityLabel="条件をクリア" style={styles.secondaryButtonWide} onPress={clearFilters}>
              <Text style={styles.secondaryButtonText}>条件をクリア</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {jobs.map((job, index) => (
        <JobCard
          key={job.id}
          job={job}
          rank={rankLabels[index]}
          saved={savedIds?.includes(job.id) === true}
          busy={busyJobId !== null || savedIds === null || !privateAllowed || loading}
          onToggleSaved={() => void toggleSaved(job.id)}
          onOpen={() => router.push(`/job/${job.id}` as never)}
        />
      ))}

      {pageError && visibleJobs !== null ? (
        <View style={styles.filterFailure}>
          <Text accessibilityRole="alert" style={styles.error}>{pageError}</Text>
          <Pressable testID="job-pagination-retry" accessibilityRole="button" style={styles.secondaryButtonWide}
            disabled={loading} onPress={() => void load(false)}>
            <Text style={styles.secondaryButtonText}>次の求人を再読み込み</Text>
          </Pressable>
        </View>
      ) : null}
      {hasMore && visibleJobs !== null && !pageError ? (
        <Pressable style={styles.secondaryButtonWide} disabled={loading} onPress={() => void load(false)}>
          {loading ? <ActivityIndicator /> : <Text style={styles.secondaryButtonText}>さらに見る（{Math.min(jobs.length, totalCount)}/{totalCount}件）</Text>}
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="link" accessibilityLabel="1日だけのスポット勤務を探す" style={styles.secondaryButtonWide}
        onPress={() => router.push('/spot-jobs' as never)}>
        <Text style={styles.link}>1日だけのスポット勤務を探す</Text>
      </Pressable>
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
  jobCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 9, borderWidth: 1, borderColor: '#F5DCE4' },
  jobHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  jobIdentity: { flex: 1, gap: 5 },
  saveHeart: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F0D8E0', borderRadius: 12 },
  saveHeartActive: { backgroundColor: '#FFF0F4', borderColor: '#E9265A' },
  rankLabel: { alignSelf: 'flex-start', color: '#A9204B', backgroundColor: '#FFF0F4', fontSize: 12, fontWeight: '800', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4 },
  rankingBox: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#F5DCE4', padding: 12, gap: 10 },
  rankingToggle: { minHeight: 44, justifyContent: 'center', gap: 3 },
  rankingHeadline: { fontSize: 14, fontWeight: '800', color: '#4B3441' },
  rankingSummary: { fontSize: 13, fontWeight: '700', color: '#7D596A', lineHeight: 19 },
  rankingTextGroup: { gap: 10 },
  rankingDetail: { fontSize: 14, color: '#645963', lineHeight: 21 },
  jobTitle: { fontSize: 18, lineHeight: 26, fontWeight: '800', color: '#34222B' },
  facility: { fontWeight: '800', fontSize: 14, color: '#645963' },
  meta: { color: '#5f6670', fontSize: 14, lineHeight: 21 },
  salary: { fontWeight: '800', fontSize: 17, color: '#30212B' },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { backgroundColor: '#edf4ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, fontSize: 12, fontWeight: '700' },
  badgeClosed: { backgroundColor: '#FCEBEC', color: '#A9232B', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, fontSize: 12, fontWeight: '800' },
  badgeVerified: { backgroundColor: '#EAF7F0', color: '#216745', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, fontSize: 12, fontWeight: '800' },
  badgeFinance: { backgroundColor: '#EEF2FF', color: '#3B4D91', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, fontSize: 12, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  secondaryButton: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  secondaryButtonWide: { minHeight: 48, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  secondaryButtonText: { fontWeight: '800' },
  subtle: { color: '#606873', lineHeight: 20 },
  link: { fontWeight: '800', textDecorationLine: 'underline' },
  error: { color: '#b42318', backgroundColor: '#fff1f0', padding: 12, borderRadius: 10 },
});
