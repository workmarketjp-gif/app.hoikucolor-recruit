import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import {
  getApplicationDetail,
  getApplicationDocumentHandoffState,
  listApplicationMessages,
  repairApplicationDocumentHandoff,
  respondToInterviewDurable,
  sendApplicationMessageDurable,
  type ApplicationDocumentHandoffState,
  type JobseekerApplicationDetail,
  type JobseekerInterview,
  type JobseekerMessage,
} from '../../lib/applicationJourneyApi';

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
}: {
  key?: string;
  interview: JobseekerInterview;
  applicationId: string;
  focused: boolean;
  onChanged: () => Promise<void>;
}) {
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [message, setMessage] = useState(interview.candidate_response_message ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meetingUrl = safeHttps(interview.meeting_url);
  const canRespond = interview.status === 'scheduled';

  const respond = async (responseStatus: 'accepted' | 'reschedule_requested') => {
    setBusy(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      await respondToInterviewDurable({
        client: pinned.client,
        ownerId: pinned.ownerId,
        ownerSessionId: pinned.ownerSessionId,
        applicationId,
        interviewId: interview.id,
        responseStatus,
        candidateMessage: responseStatus === 'reschedule_requested' ? message : null,
      });
      if (!pinned.isCurrent()) return;
      await onChanged();
    } catch (responseError) {
      setError(String((responseError as { message?: unknown })?.message ?? responseError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.eventCard, focused && styles.focusedCard]}>
      <Text style={styles.eventTitle}>{formatDateTime(interview.scheduled_at)}</Text>
      <Text style={styles.subtle}>{interview.duration_minutes}分 ・ {interview.status}</Text>
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
        <Pressable style={styles.secondaryButton} onPress={() => void Linking.openURL(meetingUrl)}>
          <Text style={styles.secondaryText}>オンライン面接を開く</Text>
        </Pressable>
      ) : null}
      {canRespond ? (
        <>
          <Pressable style={styles.primaryButton} disabled={busy} onPress={() => void respond('accepted')}>
            <Text style={styles.primaryText}>{busy ? '送信中…' : 'この日時でOK'}</Text>
          </Pressable>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="日程変更の希望日時・時間帯"
            multiline
            maxLength={1000}
            style={styles.textArea}
          />
          <Pressable
            style={styles.secondaryButton}
            disabled={busy || !message.trim()}
            onPress={() => void respond('reschedule_requested')}
          >
            <Text style={styles.secondaryText}>日程変更を希望</Text>
          </Pressable>
        </>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export default function ApplicationDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; focus?: string | string[]; interviewId?: string | string[]; documentWarning?: string | string[] }>();
  const router = useRouter();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const applicationId = firstParam(params.id) ?? '';
  const focus = firstParam(params.focus) ?? null;
  const focusedInterviewId = firstParam(params.interviewId) ?? null;
  const warnedDocumentHandoff = firstParam(params.documentWarning) === '1';
  const [detail, setDetail] = useState<JobseekerApplicationDetail | null>(null);
  const [messages, setMessages] = useState<JobseekerMessage[]>([]);
  const [documentState, setDocumentState] = useState<ApplicationDocumentHandoffState | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (quiet = false) => {
    const current = ++generation.current;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const [nextDetail, nextMessages, nextDocumentState] = await Promise.all([
        getApplicationDetail(pinned.client, applicationId),
        listApplicationMessages(pinned.client, applicationId),
        getApplicationDocumentHandoffState(pinned.client, applicationId).catch(() => null),
      ]);
      if (!pinned.isCurrent() || current !== generation.current) return;
      setDetail(nextDetail);
      setMessages(nextMessages);
      setDocumentState(nextDocumentState);
    } catch (loadError) {
      if (current === generation.current) setError(String((loadError as { message?: unknown })?.message ?? loadError));
    } finally {
      if (current === generation.current && !quiet) setLoading(false);
    }
  }, [applicationId, pinCandidateAction]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const sendMessage = async () => {
    setBusy(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      await sendApplicationMessageDurable({
        client: pinned.client,
        ownerId: pinned.ownerId,
        ownerSessionId: pinned.ownerSessionId,
        applicationId,
        body: messageDraft,
      });
      if (!pinned.isCurrent()) return;
      setMessageDraft('');
      await load(true);
    } catch (sendError) {
      setError(String((sendError as { message?: unknown })?.message ?? sendError));
    } finally {
      setBusy(false);
    }
  };

  const repairDocuments = async () => {
    setBusy(true);
    setHandoffError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const result = await repairApplicationDocumentHandoff(pinned.client, applicationId);
      if (!pinned.isCurrent()) return;
      setDocumentState(result.state);
      if (result.failed || result.state.missingSourceDocumentIds.length) {
        setHandoffError('一部の提出書類を復旧できませんでした。書類一覧を確認して再度お試しください。');
      }
    } catch (repairError) {
      setHandoffError(String((repairError as { message?: unknown })?.message ?? repairError));
    } finally {
      setBusy(false);
    }
  };

  const messagesFocused = focus === 'messages';
  const missingDocuments = documentState?.missingSourceDocumentIds.length ?? 0;
  const orderedMessages = useMemo(() => [...messages].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)), [messages]);

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

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.heading}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{detail.application.job_title}</Text>
          <Text style={styles.facility}>{detail.application.facility_name}</Text>
          <Text style={styles.subtle}>{[detail.application.prefecture, detail.application.city, detail.application.employment_type].filter(Boolean).join(' ・ ')}</Text>
        </View>
        <Text style={styles.status}>{detail.application.status}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {(warnedDocumentHandoff || missingDocuments > 0) ? (
        <View style={styles.warningCard}>
          <Text style={styles.sectionTitle}>提出書類を確認してください</Text>
          <Text style={styles.subtle}>
            応募自体は完了しています。既定書類の添付に未確認項目が{missingDocuments || '一部'}あります。
          </Text>
          <Pressable style={styles.secondaryButton} disabled={busy} onPress={() => void repairDocuments()}>
            <Text style={styles.secondaryText}>提出書類を再確認・復旧</Text>
          </Pressable>
          {handoffError ? <Text style={styles.error}>{handoffError}</Text> : null}
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
          <Text style={styles.sectionTitle}>面接</Text>
          <Text style={styles.count}>{detail.interviews.length}件</Text>
        </View>
        {detail.interviews.length === 0 ? <Text style={styles.subtle}>面接予定はまだありません。</Text> : null}
        {detail.interviews.map((interview) => (
          <InterviewCard
            key={interview.id}
            interview={interview}
            applicationId={applicationId}
            focused={focus === 'interview' && focusedInterviewId === interview.id}
            onChanged={() => load(true)}
          />
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeadingRow}>
          <Text style={styles.sectionTitle}>見学・体験</Text>
          <Text style={styles.count}>{detail.visits.length}件</Text>
        </View>
        {detail.visits.map((visit) => (
          <Pressable
            key={visit.id}
            style={styles.eventCard}
            onPress={() => router.push(`/visits?visitId=${encodeURIComponent(visit.id)}&jobId=${encodeURIComponent(detail.application.job_id)}&applicationId=${encodeURIComponent(applicationId)}` as never)}
          >
            <Text style={styles.eventTitle}>{visit.experience_type} ・ {formatDateTime(visit.starts_at)}</Text>
            <Text style={styles.subtle}>{visit.status}</Text>
          </Pressable>
        ))}
        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push(`/visits?jobId=${encodeURIComponent(detail.application.job_id)}&applicationId=${encodeURIComponent(applicationId)}` as never)}
        >
          <Text style={styles.secondaryText}>見学・体験を予約</Text>
        </Pressable>
      </View>

      <View style={[styles.card, messagesFocused && styles.focusedCard]}>
        <View style={styles.cardHeadingRow}>
          <Text style={styles.sectionTitle}>園とのメッセージ</Text>
          <Text style={styles.count}>{messages.length}件</Text>
        </View>
        {messagesFocused ? <Text style={styles.focusLabel}>通知からこのやり取りを開きました</Text> : null}
        {orderedMessages.length === 0 ? <Text style={styles.subtle}>メッセージはまだありません。</Text> : null}
        {orderedMessages.map((message) => (
          <View key={message.id} style={[styles.message, message.sender_role === 'jobseeker' && styles.myMessage]}>
            <Text style={styles.messageRole}>{message.sender_role === 'jobseeker' ? 'あなた' : '園'}</Text>
            <Text>{message.body}</Text>
            <Text style={styles.meta}>{formatDateTime(message.created_at)}</Text>
          </View>
        ))}
        <TextInput
          value={messageDraft}
          onChangeText={setMessageDraft}
          placeholder="園へのメッセージ"
          multiline
          maxLength={4000}
          style={styles.textArea}
        />
        <Pressable style={styles.primaryButton} disabled={busy || !messageDraft.trim()} onPress={() => void sendMessage()}>
          <Text style={styles.primaryText}>{busy ? '送信中…' : '送信'}</Text>
        </Pressable>
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
  title: { fontSize: 23, fontWeight: '900' },
  facility: { fontSize: 16, fontWeight: '800', marginTop: 3 },
  status: { backgroundColor: '#eef0f3', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, fontWeight: '800', overflow: 'hidden' },
  subtle: { color: '#606873', lineHeight: 20 },
  meta: { color: '#7a818b', fontSize: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  warningCard: { backgroundColor: '#fff8e6', borderRadius: 16, padding: 16, gap: 10 },
  focusedCard: { borderWidth: 2, borderColor: '#246bfd' },
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
  error: { color: '#b42318', backgroundColor: '#fff1f0', padding: 10, borderRadius: 9 },
  focusLabel: { color: '#155eef', fontWeight: '800' },
  message: { alignSelf: 'flex-start', maxWidth: '88%', backgroundColor: '#f0f2f5', borderRadius: 12, padding: 10, gap: 4 },
  myMessage: { alignSelf: 'flex-end', backgroundColor: '#edf4ff' },
  messageRole: { fontSize: 12, fontWeight: '800', color: '#606873' },
});
