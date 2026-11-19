import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSession } from '@clerk/expo';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { getJobseekerProfile } from '../lib/jobseekerCoreApi';
import { submitApplication } from '../lib/applicationJourneyApi';
import { usePrivateScreenCapture } from '../hooks/usePrivateScreenCapture';
import { usePrivateDataQuarantine } from '../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey } from '../lib/candidateViewOwner';
import { canStartSpotApplication } from '../lib/spotReadIntegrity';
import { readCandidateSpotSnapshotBounded } from '../lib/spotSnapshotRead';
import { armPendingHomeApplication, clearPendingHomeApplication } from '../lib/homeApplyPending';
import { armSpotApplicationDispatch } from '../lib/spotApplicationDispatch';
import { readSpotApplicationPreflight } from '../lib/spotApplicationPreflight';
import { canRefreshSpotInForeground } from '../lib/spotForegroundRefresh';
import { createSpotReadSingleFlight } from '../lib/spotReadSingleFlight';
import { canOpenVerifiedSpotApplication } from '../lib/spotApplicationNavigation';
import { pinCandidateForRead } from '../lib/pinnedCandidateRead';
import { retainConfirmedSpotApplication, navigateAfterConfirmedSpotSubmission, createSpotReadConfirmationFence } from '../lib/spotConfirmedApplication';
import { formatSpotClosingAt, spotEmptyJobsMessage, spotRemainingSlotsLabel } from '../lib/spotJobWebPresentation';
import { focusedOwnedItem, verifiedFocusId } from '../lib/scopedNotificationRoute';
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
  usePrivateScreenCapture('spot-jobs');
  const router = useRouter();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const verifiedOwnerRef = useRef<string | null>(null);
  const initialFailureOwnerRef = useRef<string | null>(null);
  const currentOwnerRef = useRef(ownerKey);
  const readSingleFlightRef = useRef(createSpotReadSingleFlight());
  const applyingRef = useRef<{ owner: string; generation: number; jobId: string } | null>(null);
  const detailOpenRef = useRef(false);
  const detailOpenRequestRef = useRef(0);
  if (currentOwnerRef.current !== ownerKey) {
    currentOwnerRef.current = ownerKey;
    readSingleFlightRef.current.invalidate();
    detailOpenRequestRef.current += 1;
    detailOpenRef.current = false;
    verifiedOwnerRef.current = null;
    initialFailureOwnerRef.current = null;
  }
  if (privacy.shieldVisible || !privacy.canAccessPrivateData()) {
    detailOpenRequestRef.current += 1;
    detailOpenRef.current = false;
    verifiedOwnerRef.current = null;
    initialFailureOwnerRef.current = null;
  }
  const [jobs, setJobs] = useState<SpotJobListing[]>([]);
  const [assignments, setAssignments] = useState<SpotAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingApplicationId, setOpeningApplicationId] = useState<string | null>(null);
  const [detailOpenError, setDetailOpenError] = useState<string | null>(null);
  const generation = useRef(0);
  const confirmationReadFenceRef = useRef(createSpotReadConfirmationFence());
  const { assignmentId: rawAssignmentId } = useLocalSearchParams<{ assignmentId?: string }>();
  const focusedAssignmentId = verifiedFocusId(rawAssignmentId);
  const focusedAssignment = focusedOwnedItem(assignments, focusedAssignmentId, (item) => item.assignment_id);
  const orderedAssignments = focusedAssignment
    ? [focusedAssignment, ...assignments.filter((item) => item.assignment_id !== focusedAssignmentId)]
    : assignments;

  const load = useCallback(async (quiet = false) => {
    const privateAllowed = Boolean(ownerKey && !privacy.shieldVisible && privacy.canAccessPrivateData());
    // A double tap, visible retry or focus event must not duplicate active RPCs.
    // The lease is owner-scoped and is invalidated on blur/lock/session change.
    const readLease = privateAllowed ? readSingleFlightRef.current.begin(ownerKey) : null;
    if (privateAllowed && !readLease) return false;
    const current = ++generation.current;
    const readConfirmationEpoch = confirmationReadFenceRef.current.captureReadEpoch();
    if (!quiet) {
      verifiedOwnerRef.current = null;
      initialFailureOwnerRef.current = null;
      setLoading(true);
      setError(null);
    }
    // App Lock and signed-out states must not issue candidate RPCs.
    if (!privateAllowed || !readLease) {
      readSingleFlightRef.current.invalidate();
      setJobs([]);
      setAssignments([]);
      initialFailureOwnerRef.current = null;
      if (!quiet) setLoading(false);
      return false;
    }
    try {
      const { jobs: nextJobs, assignments: nextAssignments } = await readCandidateSpotSnapshotBounded({
        pin: pinCandidateAction,
        readJobs: (pinned) => listSpotJobs(pinned.client),
        readAssignments: (pinned) => listMySpotAssignments(pinned.client),
        isCurrent: () => Boolean(readSingleFlightRef.current.isCurrent(readLease) &&
          ownerKey && current === generation.current &&
          currentOwnerRef.current === ownerKey && !privacy.shieldVisible &&
          privacy.canAccessPrivateData()),
        ownsPin: (pinned) => candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) === ownerKey,
      });
      if (!readSingleFlightRef.current.isCurrent(readLease) ||
          current !== generation.current || currentOwnerRef.current !== ownerKey ||
          privacy.shieldVisible || !privacy.canAccessPrivateData() ||
          !confirmationReadFenceRef.current.canCommitRead(readConfirmationEpoch)) return false;
      verifiedOwnerRef.current = ownerKey;
      // Only clear a read failure on confirmed recovery. An unresolved apply
      // warning must survive ordinary background list refreshes.
      if (initialFailureOwnerRef.current === ownerKey) setError(null);
      initialFailureOwnerRef.current = null;
      setJobs(nextJobs);
      setAssignments(nextAssignments);
      return true;
    } catch {
      if (!quiet && readSingleFlightRef.current.isCurrent(readLease) &&
          current === generation.current && currentOwnerRef.current === ownerKey &&
          !privacy.shieldVisible && privacy.canAccessPrivateData() &&
          confirmationReadFenceRef.current.canCommitRead(readConfirmationEpoch)) {
        initialFailureOwnerRef.current = ownerKey;
        setError('スポット勤務の情報を確認できませんでした。再読み込みしてください。');
      }
      return false;
    } finally {
      readSingleFlightRef.current.finish(readLease);
      if (current === generation.current) {
        if (!quiet) setLoading(false);
      }
    }
  }, [pinCandidateAction, ownerKey, privacy.shieldVisible, privacy.canAccessPrivateData]);

  useFocusEffect(useCallback(() => {
    if (!ownerKey || privacy.shieldVisible || !privacy.canAccessPrivateData()) {
      generation.current += 1;
      readSingleFlightRef.current.invalidate();
      detailOpenRequestRef.current += 1;
      detailOpenRef.current = false;
      setOpeningApplicationId(null);
      setDetailOpenError(null);
      verifiedOwnerRef.current = null;
      initialFailureOwnerRef.current = null;
      setJobs([]);
      setAssignments([]);
      setError(null);
      setBusyId(null);
      setLoading(true);
      return;
    }
    void load();
    // Match Web's once-per-minute visible refresh without touching in-flight
    // applications or showing a loading screen over a verified snapshot.
    const refreshWhenActive = () => {
      if (!canRefreshSpotInForeground({
        foreground: AppState.currentState === 'active',
        ownerKey,
        currentOwnerKey: currentOwnerRef.current,
        verifiedOwnerKey: verifiedOwnerRef.current,
        initialFailureOwnerKey: initialFailureOwnerRef.current,
        privateAllowed: !privacy.shieldVisible && privacy.canAccessPrivateData(),
        readInFlight: readSingleFlightRef.current.isBusy(ownerKey),
        applicationInFlight: applyingRef.current?.owner === ownerKey,
      })) return;
      void load(true);
    };
    const refreshInterval = setInterval(refreshWhenActive, 60_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshWhenActive();
    });
    return () => {
      clearInterval(refreshInterval);
      appStateSubscription.remove();
      generation.current += 1;
      readSingleFlightRef.current.invalidate();
      detailOpenRequestRef.current += 1;
      detailOpenRef.current = false;
      setOpeningApplicationId(null);
      setDetailOpenError(null);
      verifiedOwnerRef.current = null;
      initialFailureOwnerRef.current = null;
    };
  }, [load, focusedAssignmentId, ownerKey, privacy.shieldVisible]));

  const apply = async (job: SpotJobListing) => {
    const expectedOwner = ownerKey;
    const startedGeneration = generation.current;
    if (!canStartSpotApplication({
      jobId: job.job_id,
      visibleJobs: jobs,
      ownerKey: expectedOwner,
      verifiedOwnerKey: verifiedOwnerRef.current,
      privateAllowed: !privacy.shieldVisible && privacy.canAccessPrivateData(),
      pending: applyingRef.current?.owner === expectedOwner || detailOpenRef.current,
    }) || !expectedOwner) return;
    // This ref is set synchronously before awaits, unlike a React state update.
    const token = { owner: expectedOwner, generation: startedGeneration, jobId: job.job_id };
    applyingRef.current = token;
    setBusyId(job.job_id);
    setError(null);
    let submissionInvoked = false;
    try {
      // These are read-only prerequisites, never the submission itself.
      // A stalled Clerk token or candidate profile must not leave the button busy
      // indefinitely or allow a late response to dispatch an application.
      const preflightOwnerCurrent = () => Boolean(
        currentOwnerRef.current === expectedOwner &&
        generation.current === startedGeneration &&
        verifiedOwnerRef.current === expectedOwner &&
        !privacy.shieldVisible && privacy.canAccessPrivateData());
      const { pinned, profile } = await readSpotApplicationPreflight({
        pin: pinCandidateAction,
        readProfile: (candidate) => getJobseekerProfile(candidate.client),
        isCurrent: preflightOwnerCurrent,
        ownsPin: (candidate) => candidateViewOwnerKey(candidate.ownerId, candidate.ownerSessionId) === expectedOwner,
      });
      const stillCurrent = () => Boolean(pinned.isCurrent() && preflightOwnerCurrent());
      if (!stillCurrent()) return;
      if (!profile?.name?.trim()) {
        router.push('/(tabs)/profile');
        return;
      }
      // Share the existing candidate/job durable quarantine with Home. Its
      // in-process gate prevents two entry points from arming and submitting
      // the same vacancy concurrently. The server remains the authority.
      const reservation = await armSpotApplicationDispatch({
        isCurrent: stillCurrent,
        armPending: () => armPendingHomeApplication(pinned.ownerId, pinned.ownerSessionId, job.job_id, []),
      });
      if (reservation === 'unresolved') {
        setError('前回の応募結果が未確認です。応募管理から応募状況を確認してください。');
        return;
      }
      if (reservation !== 'armed' || !stillCurrent()) return;
      submissionInvoked = true;
      const result = await submitApplication(pinned.client, job.job_id, profile);
      if (!stillCurrent()) return;
      // submitApplication has already checked candidate-owned canonical detail.
      // Invalidate list responses that began before this confirmation: they can
      // otherwise replace the newly confirmed card with an obsolete open one.
      // New canonical reads remain authoritative, including later revocation.
      confirmationReadFenceRef.current.recordConfirmation();
      setJobs((current) => stillCurrent()
        ? retainConfirmedSpotApplication(current, job.job_id, result.applicationId)
        : current);
      // Canonical confirmation already succeeded. A stuck SecureStore cleanup
      // must not block navigation; unresolved quarantine remains fail-closed.
      navigateAfterConfirmedSpotSubmission({
        isCurrent: stillCurrent,
        clearPending: () => clearPendingHomeApplication(pinned.ownerId, job.job_id),
        navigate: () => router.push(`/application/${result.applicationId}` as never),
      });
    } catch {
      if (currentOwnerRef.current === expectedOwner && generation.current === startedGeneration &&
          !privacy.shieldVisible && privacy.canAccessPrivateData()) {
        setError(submissionInvoked
          ? '応募結果を確認できませんでした。応募管理を更新してご確認ください。自動で再応募は行いません。'
          : '応募前の安全確認ができませんでした。応募管理を確認してから再度お試しください。');
      }
    } finally {
      if (applyingRef.current === token) {
        applyingRef.current = null;
        setBusyId(null);
      }
    }
  };


  // A Spot card contains only a candidate-owned readback ID, not permission
  // to open a private record indefinitely. Recheck the same snapshot/session
  // after the bounded Clerk pin, as the Applications and Messages flows do.
  const openApplication = async (applicationId: string) => {
    if (detailOpenRef.current || applyingRef.current) return;
    const expectedOwnerKey = ownerKey;
    const startedGeneration = generation.current;
    const visibleApplicationIds = [
      ...jobs.map((job) => job.application_id),
      ...assignments.map((assignment) => assignment.application_id),
    ];
    const leaseCurrent = (resolvedOwnerKey: string | null) => canOpenVerifiedSpotApplication({
      applicationId,
      visibleApplicationIds,
      expectedOwnerKey,
      currentOwnerKey: currentOwnerRef.current,
      verifiedOwnerKey: verifiedOwnerRef.current,
      resolvedOwnerKey,
      startedGeneration,
      currentGeneration: generation.current,
      privateAllowed: !privacy.shieldVisible && privacy.canAccessPrivateData(),
      applicationPending: applyingRef.current !== null,
    });
    if (!leaseCurrent(expectedOwnerKey)) return;
    detailOpenRef.current = true; // synchronous double-tap fence
    const request = ++detailOpenRequestRef.current;
    setOpeningApplicationId(applicationId);
    setDetailOpenError(null);
    let navigationStarted = false;
    try {
      const pinned = await pinCandidateForRead(pinCandidateAction,
        () => request === detailOpenRequestRef.current && leaseCurrent(expectedOwnerKey));
      if (request !== detailOpenRequestRef.current || !pinned.isCurrent() ||
          !leaseCurrent(candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId))) return;
      router.push(`/application/${applicationId}` as never);
      navigationStarted = true;
    } catch {
      if (request === detailOpenRequestRef.current && leaseCurrent(expectedOwnerKey)) {
        setDetailOpenError('応募詳細を開けませんでした。通信状態を確認してもう一度お試しください。');
      }
    } finally {
      // Successful navigation holds the lock until screen blur; a failed pin
      // unlocks the same screen without allowing an old owner to clear a new lock.
      if (!navigationStarted && request === detailOpenRequestRef.current) {
        detailOpenRef.current = false;
        setOpeningApplicationId(null);
      }
    }
  };

  const verifiedVisible = Boolean(ownerKey) && verifiedOwnerRef.current === ownerKey
    && !privacy.shieldVisible && privacy.canAccessPrivateData();
  if (!verifiedVisible) {
    return (
      <View style={styles.center}>
        {error ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="スポット勤務をもう一度読み込む"
              style={styles.secondaryButtonWide}
              onPress={() => void load()}
            >
              <Text style={styles.secondaryText}>もう一度読み込む</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color="#fb2f52" accessibilityLabel="スポット勤務を読み込み中" />
            <Text style={styles.bodyMuted}>スポット勤務の情報を確認しています…</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View>
        <Text style={styles.title}>スポット勤務</Text>
        <Text style={styles.bodyMuted}>1日単位で働ける勤務です。通常求人とは分けて表示しています。</Text>
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {detailOpenError ? <Text accessibilityRole="alert" style={styles.error}>{detailOpenError}</Text> : null}
      {focusedAssignmentId && !loading && !focusedAssignment ? (
        <Text style={styles.error}>指定されたスポット勤務は現在のアカウントで確認できません。</Text>
      ) : null}
      {loading && jobs.length === 0 && assignments.length === 0 ? <ActivityIndicator color="#fb2f52" /> : null}

      {assignments.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>あなたのスポット勤務</Text>
          {orderedAssignments.map((assignment) => (
            <AssignmentCard
              key={assignment.assignment_id}
              assignment={assignment}
              focused={assignment.assignment_id === focusedAssignmentId}
              opening={openingApplicationId === assignment.application_id}
              navigationLocked={openingApplicationId !== null || busyId !== null}
              onOpen={() => void openApplication(assignment.application_id)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>募集中のスポット勤務</Text>
        {!loading && jobs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.itemTitle}>現在募集中のスポット勤務はありません</Text>
            <Text style={styles.bodyMuted}>{spotEmptyJobsMessage(assignments.length > 0)}</Text>
            <Pressable accessibilityRole="button" style={styles.secondaryButtonWide} onPress={() => router.push('/(tabs)/jobs')}>
              <Text style={styles.secondaryText}>通常の求人を見る</Text>
            </Pressable>
          </View>
        ) : jobs.map((job) => (
          <SpotCard
            key={job.job_id}
            job={job}
            busy={busyId === job.job_id}
            locked={(busyId !== null && busyId !== job.job_id) || openingApplicationId !== null}
            opening={openingApplicationId === job.application_id && openingApplicationId !== null}
            navigationLocked={openingApplicationId !== null || busyId !== null}
            onApply={() => void apply(job)}
            onOpenApplication={() => { if (job.application_id) void openApplication(job.application_id); }}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function AssignmentCard({ assignment, onOpen, focused, opening, navigationLocked }: {
  key?: string;
  assignment: SpotAssignment;
  onOpen: () => void;
  focused: boolean;
  opening: boolean;
  navigationLocked: boolean;
}) {
  const workedMinutes = useMemo(
    () => Math.max(0, timeToMinutes(assignment.end_time) - timeToMinutes(assignment.start_time) - assignment.break_minutes),
    [assignment],
  );
  return (
    <View style={[styles.card, focused && styles.targetCard]}>
      {focused ? <Text style={styles.targetLabel}>通知から開いたスポット勤務</Text> : null}
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
      <Pressable accessibilityRole="button"
        accessibilityLabel={`${assignment.facility_name} ${assignment.title}の応募内容を見る`}
        accessibilityState={{ disabled: navigationLocked, busy: opening }}
        disabled={navigationLocked}
        style={[styles.secondaryButtonWide, navigationLocked && styles.primaryButtonDisabled]}
        onPress={onOpen}>
        <Text style={styles.secondaryText}>{opening ? '確認中…' : '応募内容を見る'}</Text>
      </Pressable>
    </View>
  );
}

function SpotCard({
  job,
  busy,
  locked,
  opening,
  navigationLocked,
  onApply,
  onOpenApplication,
}: {
  key?: string;
  job: SpotJobListing;
  busy: boolean;
  locked: boolean;
  opening: boolean;
  navigationLocked: boolean;
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
        <Text style={styles.badge}>{spotRemainingSlotsLabel(job.available_count)}</Text>
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
      {job.closing_at ? <Text style={styles.body}>募集終了予定 {formatSpotClosingAt(job.closing_at)}</Text> : null}
      {job.description ? <Text style={styles.body}>{job.description}</Text> : null}
      {job.facility_message ? <Text style={styles.quote}>園からのメッセージ{`\n`}{job.facility_message}</Text> : null}
      {applied ? (
        <>
          <Text style={styles.success}>応募済み{job.application_status ? `・${applicationStatusLabel(job.application_status)}` : ''}</Text>
          <Pressable accessibilityRole="button"
            accessibilityLabel={`${job.facility_name} ${job.title}の応募状況を見る`}
            accessibilityState={{ disabled: navigationLocked, busy: opening }}
            disabled={navigationLocked}
            style={[styles.primaryButtonWide, navigationLocked && styles.primaryButtonDisabled]}
            onPress={onOpenApplication}>
            <Text style={styles.primaryText}>{opening ? '確認中…' : '応募状況を見る'}</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${job.facility_name} ${job.title}のスポット勤務に応募`}
          accessibilityState={{ disabled: busy || locked || job.available_count <= 0, busy }}
          style={[styles.primaryButtonWide, (busy || locked || job.available_count <= 0) && styles.primaryButtonDisabled]}
          disabled={busy || locked || job.available_count <= 0}
          onPress={onApply}
        >
          <Text style={styles.primaryText}>{busy ? '応募中…' : locked ? '別の応募を確認中…' : job.available_count <= 0 ? '満員です' : 'このスポットに応募'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: '#f6f6f5' },
  page: { padding: 16, gap: 14, backgroundColor: '#f6f6f5', flexGrow: 1 },
  title: { fontSize: 26, fontWeight: '900' },
  section: { gap: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '900' },
  itemTitle: { fontSize: 18, fontWeight: '900' },
  facility: { fontSize: 16, fontWeight: '800' },
  body: { fontSize: 16, lineHeight: 23, color: '#252a31' },
  bodyMuted: { fontSize: 15, lineHeight: 22, color: '#606873' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: '#e7e8eb' },
  targetCard: { borderColor: '#e8445a', borderWidth: 2, backgroundColor: '#fff8fa' },
  targetLabel: { color: '#b4233e', fontSize: 14, fontWeight: '800' },
  empty: { backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 12 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { fontSize: 14, fontWeight: '800', backgroundColor: '#f2f4f7', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, overflow: 'hidden' },
  badgeAccent: { fontSize: 14, fontWeight: '800', backgroundColor: '#fff0f3', color: '#b4233e', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, overflow: 'hidden' },
  facts: { gap: 7, backgroundColor: '#f7f8fa', borderRadius: 12, padding: 12 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  factLabel: { fontSize: 14, color: '#606873' },
  factValue: { fontSize: 15, fontWeight: '800', textAlign: 'right', flex: 1 },
  quote: { fontSize: 15, lineHeight: 22, backgroundColor: '#f5f8ff', padding: 12, borderRadius: 10 },
  primaryButtonWide: { minHeight: 52, borderRadius: 12, backgroundColor: '#fb2f52', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  secondaryButtonWide: { minHeight: 50, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: '#fff' },
  secondaryText: { fontSize: 15, fontWeight: '800' },
  success: { fontSize: 15, color: '#067647', backgroundColor: '#ecfdf3', padding: 10, borderRadius: 9 },
  error: { fontSize: 15, color: '#b42318', backgroundColor: '#fff1f0', padding: 12, borderRadius: 10 },
});
