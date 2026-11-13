import { useSession } from '@clerk/expo';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import { pinForApplicationMutation } from '../../lib/applicationMutationPin';
import { readApplicationMessageReview } from '../../lib/applicationMessageReviewRead';
import { usePrivateDataQuarantine } from '../../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey } from '../../lib/candidateViewOwner';
import { candidateApplicationDetailKey } from '../../lib/applicationDetailVisibility';
import { classifyApplicationDocumentHandoff, readApplicationDocumentHandoff } from '../../lib/applicationDocumentHandoffStatus';
import { applicationStatusLabel } from '../../lib/messageInbox';
import { loadApplicationCoreIndependentHandoff, retryApplicationDocumentStatus } from '../../lib/applicationCoreIndependentHandoff';
import { pinCandidateForRead } from '../../lib/pinnedCandidateRead';
import { draftAfterConfirmedMessageSend } from '../../lib/messageDraftIntegrity';
import { createApplicationDecisionGate } from '../../lib/applicationDecisionGate';
import { applicationDecisionDisclosure, canConfirmApplicationWithdrawal, isFreshApplicationWithdrawal } from '../../lib/applicationDecisionDisclosure';
import { applicationSelectionTimeline, webNextScheduledInterview } from '../../lib/applicationSelectionTimeline';
import { mergeConfirmedCandidateMessage } from '../../lib/confirmedCandidateMessage';
import { canSubmitCandidateMessage, classifyUncertainCandidateMessageReview, shouldReviewCandidateMessageAfterFailure } from '../../lib/messageComposerRecovery';
import { markVisibleApplicationMessagesRead } from '../../lib/attentionApi';
import { visibleCandidateFacilityMessageId, type CandidateMessageReadViewport } from '../../lib/candidateMessageReadVisibility';
import { focusedApplicationMessagesOffset } from '../../lib/focusedApplicationMessages';
import { applicationVisitExperienceLabel, applicationVisitStatusLabel, canSubmitInterviewResponse, formatApplicationEventDateTimeJapan, formatApplicationVisitDuration, interviewStatusLabel } from '../../lib/applicationEventPresentation';
import {
  acceptOffer,
  getApplicationDetail,
  getApplicationDocumentHandoffState,
  listApplicationMessages,
  repairApplicationDocumentHandoff,
  respondToInterviewDurable,
  sendApplicationMessageDurable,
  withdrawApplication,
  type ApplicationDocumentHandoffState,
  type JobseekerApplicationDetail,
  type JobseekerInterview,
  type JobseekerMessage,
} from '../../lib/applicationJourneyApi';
import { usePrivateScreenCapture } from '../../hooks/usePrivateScreenCapture';
import { ApplicationDocumentsSection } from '../../components/ApplicationDocumentsSection';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string | null) {
  if (!value) return '未設定';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP');
}

function safeHttps(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function InterviewCard({
  interview,
  applicationId,
  focused,
  onChanged,
  responseGate,
  onResponseSettled,
}: {
  key?: string;
  interview: JobseekerInterview;
  applicationId: string;
  focused: boolean;
  onChanged: () => Promise<void>;
  responseGate: ReturnType<typeof createApplicationDecisionGate>;
  onResponseSettled: () => void;
}) {
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [message, setMessage] = useState(interview.candidate_response_message ?? '');
  const [rescheduleOpen, setRescheduleOpen] = useState(interview.candidate_response_status === 'reschedule_requested');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Same-frame duplicate taps need a ref-backed lease, not React busy state.
  // A blurred/App Locked screen loses presentation rights, while an in-flight
  // answer remains locked until its canonical readback settles.
  // The parent retains the response gate while InterviewCard unmounts during
  // canonical refresh or navigation. The parent's blur hook revokes the lease.
  const isFocusedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    isFocusedRef.current = true;
    return () => { isFocusedRef.current = false; };
  }, []));
  const meetingUrl = safeHttps(interview.meeting_url);
  const canRespond = interview.status === 'scheduled';

  const respond = async (responseStatus: 'accepted' | 'reschedule_requested') => {
    if (!isFocusedRef.current || responseGate.isBusy()) return;
    if (!canSubmitInterviewResponse(interview, responseStatus, message)) {
      setError(responseStatus === 'reschedule_requested'
        ? '希望日時や都合のよい時間帯を入力してください。'
        : '面接の最新状態を確認してから回答してください。');
      return;
    }
    const token = responseGate.begin();
    if (token === null) return;
    const stillCurrent = () => isFocusedRef.current && responseGate.isCurrent(token);
    const submittedMessage = responseStatus === 'reschedule_requested' ? message.trim() : null;
    setBusy(true);
    setError(null);
    try {
      const pinned = await pinForApplicationMutation(pinCandidateAction, stillCurrent);
      // A slow session pin may return after navigation, App Lock, or logout.
      if (!pinned || !pinned.isCurrent() || !stillCurrent()) {
        throw new Error('安全なログイン状態を確認できませんでした。');
      }
      await respondToInterviewDurable({
        client: pinned.client,
        ownerId: pinned.ownerId,
        ownerSessionId: pinned.ownerSessionId,
        applicationId,
        interviewId: interview.id,
        responseStatus,
        candidateMessage: submittedMessage,
      });
      if (!pinned.isCurrent() || !stillCurrent()) return;
      await onChanged();
      if (!pinned.isCurrent() || !stillCurrent()) return;
      if (responseStatus === 'accepted') setRescheduleOpen(false);
    } catch (responseError) {
      if (stillCurrent()) setError(String((responseError as { message?: unknown })?.message ?? responseError));
    } finally {
      responseGate.finish(token);
      // Remounted interview cards also need a render to release the disabled
      // controls after the previous answer settles; the update is non-private.
      onResponseSettled();
      if (isFocusedRef.current && !responseGate.isBusy()) setBusy(false);
    }
  };

  return (
    <View style={[styles.eventCard, focused && styles.focusedCard]}>
      <Text style={styles.eventTitle}>{formatApplicationEventDateTimeJapan(interview.scheduled_at)}</Text>
      <Text style={styles.subtle}>{interview.duration_minutes}分 ・ {interviewStatusLabel(interview.status)}</Text>
      {interview.location ? <Text style={styles.subtle}>{interview.location}</Text> : null}
      {interview.candidate_response_status ? (
        <View style={styles.responseBox}>
          <Text style={styles.responseTitle}>
            {interview.candidate_response_status === 'accepted' ? 'この日時で参加すると回答済み' : '日程変更を希望済み'}
          </Text>
          {interview.candidate_response_message ? <Text>{interview.candidate_response_message}</Text> : null}
          {interview.candidate_responded_at ? <Text style={styles.meta}>{formatDateTime(interview.candidate_responded_at)} 回答</Text> : null}
        </View>
      ) : null}
      {meetingUrl ? (
        <Pressable style={styles.secondaryButton} onPress={() => void Linking.openURL(meetingUrl)} accessibilityRole="link">
          <Text style={styles.secondaryText}>オンライン面接</Text>
        </Pressable>
      ) : null}
      {canRespond ? (
        <>
          {interview.candidate_response_status !== 'accepted' ? (
            <Pressable style={styles.primaryButton} disabled={busy || responseGate.isBusy()} onPress={() => void respond('accepted')} accessibilityRole="button">
              <Text style={styles.primaryText}>{busy ? '送信中…' : 'この日時でOK'}</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.secondaryButton}
            disabled={busy || responseGate.isBusy()}
            accessibilityRole="button"
            accessibilityState={{ expanded: rescheduleOpen, disabled: busy }}
            onPress={() => { if (responseGate.isBusy()) return; setRescheduleOpen((open) => !open); setError(null); }}
          >
            <Text style={styles.secondaryText}>{rescheduleOpen ? '日程変更を閉じる' : '日程変更を希望'}</Text>
          </Pressable>
          {rescheduleOpen ? (
            <View style={{ gap: 8 }}>
              <Text style={styles.subtle}>希望日時・都合のよい時間帯</Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="例：平日18時以降、または土曜日の午前中を希望します。"
                multiline
                maxLength={1000}
                accessibilityLabel="希望日時・都合のよい時間帯"
                style={styles.textArea}
              />
              <Text style={styles.meta}>{message.length}/1000</Text>
              <Pressable
                style={styles.primaryButton}
                disabled={busy || responseGate.isBusy() || !canSubmitInterviewResponse(interview, 'reschedule_requested', message)}
                onPress={() => void respond('reschedule_requested')}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>{busy ? '送信中…' : '日程変更を送信'}</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : interview.candidate_response_status ? (
        <Text style={styles.subtle}>面接の状態が更新されたため、回答の変更はできません。</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/**
 * Keeping the data-bearing subtree keyed to both the Clerk session and route ID
 * prevents React Navigation from reusing another candidate's application data,
 * message drafts, offer drafts or interview answers across account/route changes.
 * Closing App Lock/foreground quarantine unmounts that subtree immediately.
 */
export default function ApplicationDetailScreen() {
  usePrivateScreenCapture('application-detail');
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const privateAllowed = !!ownerKey && !privacy.shieldVisible && privacy.canAccessPrivateData();
  const detailKey = candidateApplicationDetailKey(ownerKey, params.id, privateAllowed);
  if (!detailKey) {
    return (
      <View testID="application-private-shield" style={styles.center}>
        {privateAllowed
          ? <Text style={styles.error}>応募情報を確認できませんでした。応募一覧から開き直してください。</Text>
          : <ActivityIndicator color="#E9265A" />}
      </View>
    );
  }
  return <ApplicationDetailContent key={detailKey} />;
}

function ApplicationDetailContent() {
  const params = useLocalSearchParams<{ id?: string | string[]; focus?: string | string[]; interviewId?: string | string[]; documentWarning?: string | string[] }>();
  const router = useRouter();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const applicationId = firstParam(params.id) ?? '';
  const focus = firstParam(params.focus) ?? null;
  const focusedInterviewId = firstParam(params.interviewId) ?? null;
  const warnedDocumentHandoff = firstParam(params.documentWarning) === '1';
  const [detail, setDetail] = useState<JobseekerApplicationDetail | null>(null);
  const [messages, setMessages] = useState<JobseekerMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesReadError, setMessagesReadError] = useState(false);
  const [documentState, setDocumentState] = useState<ApplicationDocumentHandoffState | null>(null);
  const [documentLoading, setDocumentLoading] = useState(true);
  const [messageDraft, setMessageDraft] = useState('');
  const [messageSendError, setMessageSendError] = useState<string | null>(null);
  const [messageSendNeedsReview, setMessageSendNeedsReview] = useState(false);
  const [offerMessage, setOfferMessage] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const generation = useRef(0);
  const documentReadRevision = useRef(0);
  const documentStatusRetryPending = useRef(false);
  const messageSendPending = useRef(false);
  const decisionGate = useRef(createApplicationDecisionGate()).current;
  const [, setInterviewLeaseRevision] = useState(0);
  const uncertainMessageRef = useRef<{
    submittedDraft: string;
    knownMessageIds: string[];
    ownerId: string;
    ownerSessionId: string;
    applicationId: string;
  } | null>(null);
  // /messages? -> /application/:id?focus=messages must land at the thread,
  // not at the top of the application summary. A prior focused scroll is never
  // reused across a refresh, focus change or hidden private session.
  const messageScrollRef = useRef<ScrollView>(null);
  const messageAnchorYRef = useRef<number | null>(null);
  const messageViewportHeightRef = useRef(0);
  const messageContentHeightRef = useRef(0);
  const messageAnchorConsumedRef = useRef(false);
  // Reading the detail does not mean the candidate has actually viewed a
  // facility message buried below the fold. Record exact bubble geometry.
  const readViewportRef = useRef<CandidateMessageReadViewport>({
    facilityMessageId: null, measuredMessageId: null, sectionTop: null,
    messageTop: null, messageHeight: null, scrollY: 0, viewportHeight: 0,
  });
  const acknowledgedFacilityMessageRef = useRef<string | null>(null);
  const acknowledgingFacilityMessageRef = useRef<string | null>(null);
  const failedFacilityMessageRef = useRef<string | null>(null);

  const load = useCallback(async (_quiet = false) => {
    const current = ++generation.current;
    const handoffRevision = ++documentReadRevision.current;
    messageAnchorConsumedRef.current = false;
    messageAnchorYRef.current = null;
    messageViewportHeightRef.current = 0;
    messageContentHeightRef.current = 0;
    readViewportRef.current = {
      facilityMessageId: null, measuredMessageId: null, sectionTop: null,
      messageTop: null, messageHeight: null, scrollY: 0, viewportHeight: 0,
    };
    failedFacilityMessageRef.current = null;
    setLoading(true);
    setDetail(null);
    setMessages([]);
    setMessagesLoading(true);
    setMessagesReadError(false);
    setDocumentState(null);
    setDocumentLoading(true);
    setHandoffError(null);
    setWithdrawOpen(false);
    setWithdrawReason('');
    setError(null);
    try {
      const pinned = await pinCandidateForRead(pinCandidateAction, () => current === generation.current);
      await loadApplicationCoreIndependentHandoff({
        loadDetail: () => getApplicationDetail(pinned.client, applicationId),
        loadMessages: () => listApplicationMessages(pinned.client, applicationId),
        loadHandoff: () => readApplicationDocumentHandoff(
          () => getApplicationDocumentHandoffState(pinned.client, applicationId)),
        isCurrent: () => pinned.isCurrent() && current === generation.current,
        onDetail: (nextDetail) => {
          setDetail(nextDetail);
        },
        onMessages: (result) => {
          if (result.status === 'fulfilled') {
            setMessages(result.value);
          } else {
            setMessagesReadError(true);
          }
          setMessagesLoading(false);
        },
        onHandoff: (nextDocumentState) => {
          if (handoffRevision !== documentReadRevision.current) return;
          setDocumentState(nextDocumentState);
          setDocumentLoading(false);
        },
      });
    } catch (loadError) {
      if (current === generation.current) {
        setDocumentLoading(false);
        setMessagesLoading(false);
        setError(String((loadError as { message?: unknown })?.message ?? loadError));
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [applicationId, pinCandidateAction]);

  // A document-status retry must not discard an already verified interview,
  // message conversation, or draft. The canonical handoff read is optional;
  // failure is unknown, never fabricated as confirmed submission.
  const retryDocumentStatus = async () => {
    if (!detail || loading || documentLoading || documentStatusRetryPending.current) return;
    documentStatusRetryPending.current = true; // synchronous double-tap guard
    const current = generation.current;
    const revision = ++documentReadRevision.current;
    setDocumentLoading(true);
    setHandoffError(null);
    try {
      const pinned = await pinCandidateForRead(pinCandidateAction, () =>
        current === generation.current && revision === documentReadRevision.current);
      await retryApplicationDocumentStatus<ApplicationDocumentHandoffState>({
        read: () => readApplicationDocumentHandoff(
          () => getApplicationDocumentHandoffState(pinned.client, applicationId)),
        isCurrent: () => pinned.isCurrent() && current === generation.current &&
          revision === documentReadRevision.current,
        onResult: (result) => {
          setDocumentState(result.status === 'fulfilled' ? result.value : null);
          setHandoffError(result.status === 'rejected'
            ? '提出書類の確認に失敗しました。再度お試しください。' : null);
          setDocumentLoading(false);
        },
      });
    } catch {
      if (current === generation.current && revision === documentReadRevision.current) {
        setDocumentState(null);
        setHandoffError('提出書類の状態を確認できませんでした。再度お試しください。');
        setDocumentLoading(false);
      }
    } finally {
      documentStatusRetryPending.current = false;
    }
  };

  // When returning from a visit, interview or message thread, refresh the
  // canonical application + messages + document handoff as a single read.
  // The ref prevents unrelated RPC result rerenders from repeating focus loads.
  const latestLoad = useRef(load);
  latestLoad.current = load;
  useFocusEffect(useCallback(() => {
    void latestLoad.current();
    return () => {
      generation.current += 1; // Never apply an in-flight read after blur.
      decisionGate.revoke(); // In-flight decision stays locked; old presentation is revoked.
      messageAnchorConsumedRef.current = false;
      messageAnchorYRef.current = null;
      messageViewportHeightRef.current = 0;
      messageContentHeightRef.current = 0;
      setDetail(null);
      setMessages([]);
      setMessagesLoading(true);
      setMessagesReadError(false);
      setDocumentState(null);
      setDocumentLoading(true);
      setWithdrawOpen(false);
      setWithdrawReason('');
      setError(null);
      setLoading(true);
    };
  }, []));

  const sendMessage = async () => {
    // The durable RPC can finish server-side even if its response is lost.
    // Require a deliberate canonical re-read before a possible duplicate tap.
    if (messagesLoading || messagesReadError || !canSubmitCandidateMessage({
      draft: messageDraft, busy: busy || decisionGate.isBusy(), pending: messageSendPending.current,
      needsReview: messageSendNeedsReview,
    })) return;
    const submittedDraft = messageDraft;
    const knownMessageIds = messages.map((message) => message.id);
    const messageRequestGeneration = generation.current;
    let attemptedOwner: { ownerId: string; ownerSessionId: string } | null = null;
    let durableRequestStarted = false;
    messageSendPending.current = true;
    setBusy(true);
    setError(null);
    setMessageSendError(null);
    try {
      const pinned = await pinForApplicationMutation(pinCandidateAction, () => messageRequestGeneration === generation.current);
      if (!pinned || !pinned.isCurrent() || messageRequestGeneration !== generation.current) {
        throw new Error('安全なログイン状態を確認できませんでした。');
      }
      attemptedOwner = { ownerId: pinned.ownerId, ownerSessionId: pinned.ownerSessionId };
      // The durable adapter already performs a canonical list readback and
      // verifies the returned message ID, role and body. A second full-detail
      // reload could fail because of an unrelated document-handoff read,
      // incorrectly hiding a reply that was *already confirmed as sent*.
      const confirmedMessage = await sendApplicationMessageDurable({
        client: pinned.client,
        ownerId: pinned.ownerId,
        ownerSessionId: pinned.ownerSessionId,
        applicationId,
        body: submittedDraft,
        // Only a post-SecureStore, session-fenced RPC attempt is ambiguous.
        onInvokeStarted: () => { durableRequestStarted = true; },
        // A pinned token by itself is insufficient: navigation/focus changes
        // must also fence the write after asynchronous SecureStore preparation.
        isCurrent: () => pinned.isCurrent() && messageRequestGeneration === generation.current,
      });
      if (!pinned.isCurrent() || messageRequestGeneration !== generation.current) return;
      uncertainMessageRef.current = null;
      setMessages((current) => mergeConfirmedCandidateMessage(current, confirmedMessage, submittedDraft));
      // Do not erase edits typed while the previous message was in flight.
      setMessageDraft((current) => draftAfterConfirmedMessageSend(current, submittedDraft));
      setMessageSendNeedsReview(false);
      setMessageSendError(null);
    } catch (_sendError) {
      // Do not set a stale candidate's warning or retain their draft on a
      // different screen generation after an account/session transition.
      if (messageRequestGeneration !== generation.current) return;
      const needsReview = shouldReviewCandidateMessageAfterFailure(durableRequestStarted);
      uncertainMessageRef.current = needsReview && attemptedOwner
        ? { submittedDraft, knownMessageIds, ...attemptedOwner, applicationId }
        : null;
      setMessageSendNeedsReview(needsReview);
      setMessageSendError(needsReview
        ? '送信が完了した可能性があります。重複を防ぐため、最新のメッセージを読み込んでからご確認ください。'
        : '今回の送信を開始できませんでした。ログイン状態や端末の保存状態を確認してから再度お試しください。');
    } finally {
      messageSendPending.current = false;
      setBusy(false);
    }
  };

  /** A synchronous lease, not React busy alone, blocks same-frame duplicate decisions. */
  const runDecision = async (
    action: (stillCurrent: () => boolean) => Promise<void>,
    onError: (message: string) => void,
  ) => {
    if (busy || messageSendPending.current) return;
    const token = decisionGate.begin();
    if (token === null) return;
    const actionGeneration = generation.current;
    const stillCurrent = () =>
      actionGeneration === generation.current && decisionGate.isCurrent(token);
    setBusy(true);
    try {
      await action(stillCurrent);
    } catch (actionError) {
      if (stillCurrent()) onError(String((actionError as { message?: unknown })?.message ?? actionError));
    } finally {
      // Blur keeps the network operation locked until it settles, but suppresses
      // stale detail/message/error updates. Unlocking busy is not private data.
      decisionGate.finish(token);
      setBusy(false);
    }
  };

  const reviewMessageSend = async () => {
    // Review is a canonical read only. It must never automatically send again.
    await runDecision(async (stillCurrent) => {
      const review = uncertainMessageRef.current;
      const nextMessages = await readApplicationMessageReview({
        pin: pinCandidateAction,
        read: listApplicationMessages,
        applicationId,
        pendingOwner: review ? {
          ownerId: review.ownerId,
          ownerSessionId: review.ownerSessionId,
          applicationId: review.applicationId,
        } : null,
        isCurrent: stillCurrent,
      });
      if (!stillCurrent()) return;
      setMessages(nextMessages);
      setMessagesLoading(false);
      setMessagesReadError(false);
      const reviewStatus = classifyUncertainCandidateMessageReview(review, nextMessages);
      if (reviewStatus === 'unverified') {
        // A successful list read is not proof of failed delivery: never unlock
        // the composer just because an eventually consistent thread is empty.
        // Keep the same candidate/session/application review record and draft.
        setMessageSendNeedsReview(true);
        setMessageSendError('最新のメッセージを取得しましたが、この送信の完了は確認できませんでした。重複送信を防ぐため、時間をおいてもう一度確認してください。');
        return;
      }
      if (reviewStatus === 'confirmed' && review) {
        setMessageDraft((current) => draftAfterConfirmedMessageSend(current, review.submittedDraft));
      }
      uncertainMessageRef.current = null;
      setMessageSendNeedsReview(false);
      setMessageSendError(null);
    }, () => {
      setMessageSendError('最新のメッセージを確認できませんでした。通信状態を確認してから、もう一度お試しください。');
    });
  };

  const acceptCurrentOffer = async () => {
    await runDecision(async (stillCurrent) => {
      setError(null);
      const pinned = await pinForApplicationMutation(pinCandidateAction, stillCurrent);
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      if (!pinned.isCurrent() || !stillCurrent()) return;
      const next = await acceptOffer(pinned.client, applicationId, offerMessage);
      if (!pinned.isCurrent() || !stillCurrent()) return;
      setDetail(next);
    }, setError);
  };

  const withdrawCurrentApplication = async () => {
    // Opening the disclosure is not consent to an irreversible withdrawal.
    // Recheck the exact canonical status even if an old confirm handler fires.
    const confirmation = detail?.application;
    const status = confirmation?.status;
    const offerResponse = confirmation?.candidate_offer_response;
    if (!canConfirmApplicationWithdrawal(status, offerResponse, withdrawOpen)) return;
    await runDecision(async (stillCurrent) => {
      setError(null);
      const pinned = await pinForApplicationMutation(pinCandidateAction, stillCurrent);
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      if (!pinned.isCurrent() || !stillCurrent()) return;
      if (!canConfirmApplicationWithdrawal(status, offerResponse, withdrawOpen)) return;
      // This deliberate confirmation does not authorize an action on changed
      // canonical selection or offer state. Re-read through the candidate RPC.
      const freshDetail = await getApplicationDetail(pinned.client, applicationId);
      if (!pinned.isCurrent() || !stillCurrent()) return;
      if (!isFreshApplicationWithdrawal(confirmation, freshDetail?.application)) {
        setWithdrawOpen(false);
        setWithdrawReason('');
        throw new Error('応募状況が更新されました。最新の状態に更新してから操作してください。');
      }
      const next = await withdrawApplication(pinned.client, applicationId, withdrawReason);
      if (!pinned.isCurrent() || !stillCurrent()) return;
      setDetail(next);
      setWithdrawOpen(false);
      setWithdrawReason('');
      await load(true);
    }, setError);
  };

  const repairDocuments = async () => {
    await runDecision(async (stillCurrent) => {
      setHandoffError(null);
      const pinned = await pinForApplicationMutation(pinCandidateAction, stillCurrent);
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      if (!pinned.isCurrent() || !stillCurrent()) return;
      const result = await repairApplicationDocumentHandoff(pinned.client, applicationId);
      if (!pinned.isCurrent() || !stillCurrent()) return;
      documentReadRevision.current += 1;
      setDocumentState(result.state);
      setDocumentLoading(false);
      if (result.failed || result.state.missingSourceDocumentIds.length) {
        setHandoffError('一部の提出書類を復旧できませんでした。書類一覧を確認して再度お試しください。');
      }
    }, setHandoffError);
  };

  const messagesFocused = focus === 'messages';
  const maybeScrollToMessages = () => {
    const offset = focusedApplicationMessagesOffset({
      focused: messagesFocused,
      alreadyFocused: messageAnchorConsumedRef.current,
      anchorY: messageAnchorYRef.current,
      contentHeight: messageContentHeightRef.current,
      viewportHeight: messageViewportHeightRef.current,
    });
    if (offset === null || !messageScrollRef.current) return;
    messageAnchorConsumedRef.current = true;
    const focusGeneration = generation.current;
    requestAnimationFrame(() => {
      // A late animation frame may race with leaving the private thread.
      if (focusGeneration !== generation.current || !messageAnchorConsumedRef.current) return;
      messageScrollRef.current?.scrollTo({ y: offset, animated: false });
    });
  };
  const missingDocuments = documentState?.missingSourceDocumentIds.length ?? 0;
  const documentReadState = classifyApplicationDocumentHandoff(documentState);
  const orderedMessages = useMemo(() => [...messages].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)), [messages]);
  const latestFacilityMessageId = [...orderedMessages].reverse().find((message) => message.sender_role === 'facility')?.id ?? null;
  const maybeAcknowledgeVisibleFacilityMessage = () => {
    const target = visibleCandidateFacilityMessageId({
      ...readViewportRef.current, facilityMessageId: latestFacilityMessageId,
    });
    if (!target || target === acknowledgedFacilityMessageRef.current ||
        target === acknowledgingFacilityMessageRef.current ||
        target === failedFacilityMessageRef.current) return;
    const readGeneration = generation.current;
    acknowledgingFacilityMessageRef.current = target;
    void (async () => {
      try {
        const pinned = await pinForApplicationMutation(pinCandidateAction, () => readGeneration === generation.current);
        if (!pinned || !pinned.isCurrent() || readGeneration !== generation.current) return;
        // Do not mark read after a slow session pin if the bubble is now hidden.
        if (visibleCandidateFacilityMessageId({
          ...readViewportRef.current, facilityMessageId: latestFacilityMessageId,
        }) !== target) return;
        await markVisibleApplicationMessagesRead(pinned.client, applicationId);
        if (pinned.isCurrent() && readGeneration === generation.current) {
          acknowledgedFacilityMessageRef.current = target;
        }
      } catch {
        // No fabricated read success; a fresh canonical reload can retry.
        if (readGeneration === generation.current) failedFacilityMessageRef.current = target;
      } finally {
        if (acknowledgingFacilityMessageRef.current === target) {
          acknowledgingFacilityMessageRef.current = null;
        }
      }
    })();
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator /><Text>応募情報を読み込んでいます…</Text></View>;
  }

  if (error && !detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.secondaryButton} onPress={() => void load()}><Text style={styles.secondaryText}>再読み込み</Text></Pressable>
      </View>
    );
  }

  if (!detail) {
    return <View style={styles.center}><Text>この応募は確認できません。</Text></View>;
  }

  const selectionTimeline = applicationSelectionTimeline(detail.application.status);
  const nextInterview = webNextScheduledInterview(detail.interviews);
  const decisionDisclosure = applicationDecisionDisclosure(detail.application.status, detail.application.candidate_offer_response);

  return (
    <ScrollView
      ref={messageScrollRef}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={100}
      onScroll={(event) => {
        readViewportRef.current = {
          ...readViewportRef.current, scrollY: Math.max(0, event.nativeEvent.contentOffset.y),
        };
        maybeAcknowledgeVisibleFacilityMessage();
      }}
      onLayout={(event) => {
        messageViewportHeightRef.current = event.nativeEvent.layout.height;
        readViewportRef.current = {
          ...readViewportRef.current, viewportHeight: event.nativeEvent.layout.height,
        };
        maybeScrollToMessages();
        maybeAcknowledgeVisibleFacilityMessage();
      }}
      onContentSizeChange={(_width, height) => {
        messageContentHeightRef.current = height;
        maybeScrollToMessages();
      }}
    >
      <View style={styles.heading}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{detail.application.job_title}</Text>
          <Text style={styles.facility}>{detail.application.facility_name}</Text>
          <Text style={styles.subtle}>{[detail.application.prefecture, detail.application.city, detail.application.employment_type].filter(Boolean).join(' ・ ')}</Text>
        </View>
        <Text style={styles.status}>{applicationStatusLabel(detail.application.status)}</Text>
      </View>
      <View style={styles.refreshRow}>
        <Pressable
          testID="application-detail-canonical-refresh"
          style={styles.secondaryButton}
          accessibilityRole="button"
          disabled={busy || decisionGate.isBusy() || messageSendPending.current}
          onPress={() => void load(false)}
        >
          <Text style={styles.secondaryText}>最新の状態に更新</Text>
        </Pressable>
      </View>

      {nextInterview ? (
        <View style={styles.nextInterviewCard} testID="application-next-interview">
          <Text style={styles.nextInterviewTitle}>次回の面接</Text>
          <Text style={styles.nextInterviewDate}>{formatApplicationEventDateTimeJapan(nextInterview.scheduled_at)}</Text>
          {nextInterview.location ? <Text style={styles.subtle}>{nextInterview.location}</Text> : null}
          {!nextInterview.candidate_response_status ? (
            <Text style={styles.nextInterviewAlert}>日時を確認して回答してください</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.selectionTimeline} testID="application-selection-timeline" accessibilityLabel="選考状況">
        {selectionTimeline.terminal ? (
          <View style={styles.selectionTerminal}>
            <Text style={styles.selectionTerminalTitle}>{applicationStatusLabel(detail.application.status)}</Text>
            <Text style={styles.selectionTerminalMessage}>{selectionTimeline.terminalMessage}</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectionRow}
          >
            {selectionTimeline.steps.map((step, index) => (
              <View
                key={step.key}
                style={styles.selectionStep}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${step.label}、${step.complete ? '到達済み' : '未到達'}`}
              >
                {index < selectionTimeline.steps.length - 1 ? (
                  <View style={[styles.selectionConnector, step.complete && styles.selectionConnectorComplete]} />
                ) : null}
                <View style={[styles.selectionCircle, step.complete && styles.selectionCircleComplete]}>
                  <Text style={[styles.selectionNumber, step.complete && styles.selectionNumberComplete]}>
                    {step.complete ? '✓' : step.number}
                  </Text>
                </View>
                <Text style={[styles.selectionLabel, step.complete && styles.selectionLabelComplete]}>
                  {step.label}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {documentLoading ? (
        <View style={styles.card} accessibilityLiveRegion="polite">
          <Text style={styles.subtle}>提出書類の状態を確認しています…</Text>
        </View>
      ) : null}
      {!documentLoading && (warnedDocumentHandoff || documentReadState !== 'confirmed') ? (
        <View style={styles.warningCard}>
          <Text style={styles.sectionTitle}>提出書類を確認してください</Text>
          <Text style={styles.subtle}>
            {documentReadState === 'unverified'
              ? '提出書類の状態を取得できませんでした。応募は完了していますが、添付状況は未確認です。通信状態を確認して再読み込みしてください。'
              : documentReadState === 'missing'
                ? `応募は完了しています。提出書類の添付を確認できないものが${missingDocuments}件あります。`
                : '応募直後に書類添付の警告がありました。最新の提出状況をご確認ください。'}
          </Text>
          <Pressable
            style={styles.secondaryButton}
            disabled={busy || documentStatusRetryPending.current}
            onPress={() => void (documentReadState === 'missing' ? repairDocuments() : retryDocumentStatus())}
          >
            <Text style={styles.secondaryText}>
              {documentReadState === 'missing' ? '提出書類を再確認・復旧' : '提出状況を再読み込み'}
            </Text>
          </Pressable>
          {handoffError ? <Text style={styles.error}>{handoffError}</Text> : null}
        </View>
      ) : null}

      {decisionDisclosure ? (
        <View style={[styles.card, decisionDisclosure.offered && styles.offerCard]} testID="application-decision-card">
          <Text style={styles.sectionTitle}>{decisionDisclosure.heading}</Text>
          {decisionDisclosure.accepted ? (
            <View style={styles.acceptedOfferSummary}>
              <Text style={styles.offerAccepted}>✓ この内定を承諾しました</Text>
              {detail.application.candidate_offer_message ? <Text>{detail.application.candidate_offer_message}</Text> : null}
              {detail.application.candidate_offer_responded_at ? <Text style={styles.meta}>{formatDateTime(detail.application.candidate_offer_responded_at)} 回答</Text> : null}
            </View>
          ) : null}
          <Text style={styles.subtle}>{decisionDisclosure.explanation}</Text>
          {decisionDisclosure.canAccept && !withdrawOpen ? (
            <>
              <Text style={styles.formLabel}>園への連絡事項（任意）</Text>
              <TextInput value={offerMessage} onChangeText={setOfferMessage} placeholder="例：内定ありがとうございます。入職日についてご相談させてください。" multiline maxLength={1000} style={styles.textArea} />
              <Text style={styles.meta}>{offerMessage.length}/1000</Text>
            </>
          ) : null}
          {!withdrawOpen ? (
            <View style={styles.decisionActions}>
              <Pressable
                testID="application-withdraw-open"
                style={styles.secondaryButton}
                disabled={busy || decisionGate.isBusy()}
                onPress={() => { setWithdrawOpen(true); setError(null); }}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryText}>{decisionDisclosure.withdrawLabel}</Text>
              </Pressable>
              {decisionDisclosure.canAccept ? (
                <Pressable style={styles.primaryButton} disabled={busy || decisionGate.isBusy()} onPress={() => void acceptCurrentOffer()} accessibilityRole="button">
                  <Text style={styles.primaryText}>{busy ? '送信中…' : '内定を承諾する'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.withdrawConfirmation} testID="application-withdraw-confirmation">
              <Text style={styles.confirmationWarning}>{decisionDisclosure.confirmationWarning}</Text>
              <Text style={styles.formLabel}>辞退理由・園への連絡（任意）</Text>
              <TextInput value={withdrawReason} onChangeText={setWithdrawReason} placeholder="例：一身上の都合により辞退いたします。" multiline maxLength={1000} style={styles.textArea} />
              <Text style={styles.meta}>{withdrawReason.length}/1000</Text>
              <View style={styles.decisionActions}>
                <Pressable style={styles.secondaryButton} disabled={busy || decisionGate.isBusy()} onPress={() => { setWithdrawOpen(false); setWithdrawReason(''); setError(null); }} accessibilityRole="button" testID="application-withdraw-cancel">
                  <Text style={styles.secondaryText}>やめる</Text>
                </Pressable>
                <Pressable style={styles.dangerButton} disabled={busy || decisionGate.isBusy()} onPress={() => void withdrawCurrentApplication()} accessibilityRole="button" testID="application-withdraw-confirm">
                  <Text style={styles.dangerText}>{busy ? '送信中…' : '辞退を確定する'}</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>応募内容</Text>
        <Text style={styles.meta}>応募日 {formatDateTime(detail.application.applied_at)}</Text>
        <Text>入職希望日: {detail.application.desired_start_date ?? '未設定'}</Text>
        <Text>{detail.application.message?.trim() || '応募時のメッセージはありません。'}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeadingRow}>
          <Text style={styles.sectionTitle}>面接予定</Text>
          <Text style={styles.count}>{detail.interviews.length}件</Text>
        </View>
        {detail.interviews.length === 0 ? <Text style={styles.subtle}>面接予定はまだ登録されていません。日程が決まるとここに表示されます。</Text> : null}
        {detail.interviews.map((interview) => (
          <InterviewCard
            key={interview.id}
            interview={interview}
            applicationId={applicationId}
            focused={focus === 'interview' && focusedInterviewId === interview.id}
            onChanged={() => load(true)}
            responseGate={decisionGate}
            onResponseSettled={() => setInterviewLeaseRevision((revision) => revision + 1)}
          />
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeadingRow}>
          <Text style={styles.sectionTitle}>見学・体験</Text>
          <Text style={styles.count}>{detail.visits.length}件</Text>
        </View>
        {detail.visits.length === 0 ? (
          <Text style={styles.subtle}>この求人に関連する見学・体験予約はありません。</Text>
        ) : null}
        {detail.visits.map((visit) => {
          const duration = formatApplicationVisitDuration(visit.starts_at, visit.ends_at);
          return (
            <Pressable
              key={visit.id}
              style={styles.eventCard}
              onPress={() => router.push(`/visits?visitId=${encodeURIComponent(visit.id)}&jobId=${encodeURIComponent(detail.application.job_id)}&applicationId=${encodeURIComponent(applicationId)}` as never)}
            >
              <Text style={styles.eventTitle}>{applicationVisitExperienceLabel(visit.experience_type)} ・ {formatApplicationEventDateTimeJapan(visit.starts_at)}</Text>
              <Text style={styles.subtle}>{applicationVisitStatusLabel(visit.status)}{duration ? ` ・ ${duration}` : ''}</Text>
              {visit.candidate_message ? <Text style={styles.subtle}>{visit.candidate_message}</Text> : null}
            </Pressable>
          );
        })}
        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push(`/visits?jobId=${encodeURIComponent(detail.application.job_id)}&applicationId=${encodeURIComponent(applicationId)}` as never)}
        >
          <Text style={styles.secondaryText}>見学・体験を予約</Text>
        </Pressable>
      </View>

      <View style={[styles.card, messagesFocused && styles.focusedCard]}
        onLayout={(event) => {
          messageAnchorYRef.current = event.nativeEvent.layout.y;
          readViewportRef.current = {
            ...readViewportRef.current, sectionTop: event.nativeEvent.layout.y,
          };
          maybeScrollToMessages();
          maybeAcknowledgeVisibleFacilityMessage();
        }}>
        <View style={styles.cardHeadingRow}>
          <Text style={styles.sectionTitle}>園とのメッセージ</Text>
          <Text style={styles.count}>{messagesLoading ? '確認中' : messagesReadError ? '未確認' : `${messages.length}件`}</Text>
        </View>
        {messagesFocused ? <Text style={styles.focusLabel}>園とのメッセージを表示しています</Text> : null}
        {messagesLoading ? <Text style={styles.subtle}>メッセージを確認しています…</Text> : null}
        {messagesReadError ? (
          <View style={styles.messageFeedback} accessibilityLiveRegion="polite">
            <Text style={styles.error}>メッセージを取得できませんでした。最新の内容を確認するまで送信できません。</Text>
            <Pressable style={styles.secondaryButton} accessibilityRole="button" onPress={() => void load()}>
              <Text style={styles.secondaryText}>再読み込み</Text>
            </Pressable>
          </View>
        ) : null}
        {!messagesLoading && !messagesReadError && orderedMessages.length === 0 ? <Text style={styles.subtle}>まだメッセージはありません。ここから園へ連絡できます。</Text> : null}
        {orderedMessages.map((message) => (
          <View key={message.id}
            onLayout={message.id === latestFacilityMessageId ? (event) => {
              readViewportRef.current = {
                ...readViewportRef.current, measuredMessageId: message.id,
                messageTop: event.nativeEvent.layout.y,
                messageHeight: event.nativeEvent.layout.height,
              };
              maybeAcknowledgeVisibleFacilityMessage();
            } : undefined}
            style={[styles.message, message.sender_role === 'jobseeker' && styles.myMessage]}>
            <Text style={styles.messageRole}>{message.sender_role === 'jobseeker' ? 'あなた' : '園'}</Text>
            <Text>{message.body}</Text>
            <Text style={styles.meta}>{formatDateTime(message.created_at)}</Text>
          </View>
        ))}
        <Text style={styles.formLabel}>メッセージ</Text>
        <TextInput
          value={messageDraft}
          onChangeText={setMessageDraft}
          placeholder="園への質問や日程の相談など"
          multiline
          maxLength={4000}
          style={styles.textArea}
        />
        <Text style={styles.meta}>{messageDraft.length}/4000</Text>
        {messageSendError ? (
          <View style={styles.messageFeedback} accessibilityLiveRegion="polite">
            <Text style={styles.error}>{messageSendError}</Text>
            {messageSendNeedsReview ? (
              <Pressable style={styles.secondaryButton} disabled={busy} onPress={() => void reviewMessageSend()} accessibilityRole="button">
                <Text style={styles.secondaryText}>最新のメッセージを確認する</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Pressable style={styles.primaryButton}
          disabled={messagesLoading || messagesReadError || !canSubmitCandidateMessage({
            draft: messageDraft, busy: busy || decisionGate.isBusy(), pending: messageSendPending.current,
            needsReview: messageSendNeedsReview,
          })}
          onPress={() => void sendMessage()}>
          <Text style={styles.primaryText}>{busy ? (messageSendNeedsReview ? '確認中…' : '送信中…') : '送信する'}</Text>
        </Pressable>
        <ApplicationDocumentsSection
          applicationId={applicationId}
          onHandoffReadback={(confirmed) => {
            documentReadRevision.current += 1;
            setDocumentState(confirmed);
            setDocumentLoading(false);
          }}
        />
      </View>


      <Pressable style={styles.secondaryButton} onPress={() => router.push('/(tabs)/applications')}>
        <Text style={styles.secondaryText}>応募一覧へ戻る</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, backgroundColor: '#f7f8fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  refreshRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  title: { fontSize: 23, fontWeight: '900' },
  facility: { fontSize: 16, fontWeight: '800', marginTop: 3 },
  status: { backgroundColor: '#eef0f3', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, fontWeight: '800', overflow: 'hidden' },
  nextInterviewCard: { backgroundColor: '#fff0f3', borderWidth: 1, borderColor: '#f3c9d1', borderRadius: 14, padding: 14, gap: 4 },
  nextInterviewTitle: { color: '#1e2a3b', fontSize: 16, fontWeight: '900' },
  nextInterviewDate: { color: '#1e2a3b', fontSize: 16, fontWeight: '800' },
  nextInterviewAlert: { color: '#c8173a', fontSize: 14, fontWeight: '800' },
  selectionTimeline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ece6e4', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 10 },
  selectionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 2 },
  selectionStep: { width: 60, alignItems: 'center', gap: 6 },
  selectionCircle: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#ece6e4', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  selectionCircleComplete: { borderColor: '#fb2f52', backgroundColor: '#fb2f52' },
  selectionConnector: { position: 'absolute', top: 15, left: 46, width: 36, height: 2, backgroundColor: '#ece6e4' },
  selectionConnectorComplete: { backgroundColor: '#fb2f52' },
  selectionNumber: { fontWeight: '800', fontSize: 14, color: '#5f6977' },
  selectionNumberComplete: { color: '#fff' },
  selectionLabel: { minWidth: 60, color: '#5f6977', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  selectionLabelComplete: { color: '#1e2a3b' },
  selectionTerminal: { gap: 2, paddingHorizontal: 6, paddingVertical: 4 },
  selectionTerminalTitle: { fontSize: 17, fontWeight: '800', color: '#1e2a3b' },
  selectionTerminalMessage: { fontSize: 15, color: '#4a5566' },
  subtle: { color: '#606873', lineHeight: 20 },
  meta: { color: '#7a818b', fontSize: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  warningCard: { backgroundColor: '#fff8e6', borderRadius: 16, padding: 16, gap: 10 },
  offerCard: { backgroundColor: '#eefbf3', borderRadius: 16, padding: 16, gap: 10 },
  offerAccepted: { color: '#067647', fontWeight: '900' },
  acceptedOfferSummary: { borderRadius: 10, padding: 10, gap: 5, backgroundColor: '#e5f7ec' },
  formLabel: { fontSize: 15, fontWeight: '800', color: '#263444' },
  decisionActions: { gap: 10 },
  withdrawConfirmation: { backgroundColor: '#fff9fa', borderWidth: 1, borderColor: '#f2c6cc', borderRadius: 12, padding: 12, gap: 10 },
  confirmationWarning: { color: '#a61c2d', fontSize: 15, fontWeight: '800' },
  focusedCard: { borderWidth: 2, borderColor: '#246bfd' },
  messageFeedback: { gap: 10, padding: 12, borderRadius: 10, backgroundColor: '#FFF1F0' },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  cardHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  count: { color: '#606873', fontWeight: '700' },
  eventCard: { borderWidth: 1, borderColor: '#e0e4e9', borderRadius: 12, padding: 12, gap: 7 },
  eventTitle: { fontWeight: '800' },
  responseBox: { backgroundColor: '#f5f8ff', borderRadius: 10, padding: 10, gap: 5 },
  responseTitle: { fontWeight: '800' },
  textArea: { minHeight: 88, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, padding: 12, textAlignVertical: 'top' },
  primaryButton: { minHeight: 46, borderRadius: 12, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryText: { color: '#fff', fontWeight: '800' },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: '#fff' },
  secondaryText: { fontWeight: '800' },
  dangerButton: { minHeight: 44, borderWidth: 1, borderColor: '#d92d20', borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: '#fff' },
  dangerText: { color: '#b42318', fontWeight: '900' },
  error: { color: '#b42318', backgroundColor: '#fff1f0', padding: 10, borderRadius: 9 },
  focusLabel: { color: '#155eef', fontWeight: '800' },
  message: { alignSelf: 'flex-start', maxWidth: '88%', backgroundColor: '#f0f2f5', borderRadius: 12, padding: 10, gap: 4 },
  myMessage: { alignSelf: 'flex-end', backgroundColor: '#edf4ff' },
  messageRole: { fontSize: 12, fontWeight: '800', color: '#606873' },
});
