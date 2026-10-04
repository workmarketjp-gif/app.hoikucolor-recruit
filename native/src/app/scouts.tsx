import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import {
  listJobseekerScouts,
  respondToJobseekerScout,
  type JobseekerScout,
  type JobseekerScoutStatus,
} from '../lib/scoutApi';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUS_LABELS: Record<JobseekerScoutStatus, string> = {
  pending: '回答待ち',
  accepted: '承諾済み',
  declined: '辞退済み',
  cancelled: '取り消し',
  expired: '期限切れ',
};

function dateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ScoutsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scoutId?: string | string[] }>();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [items, setItems] = useState<JobseekerScout[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);

  const requestedScoutId = useMemo(() => {
    const raw = Array.isArray(params.scoutId) ? params.scoutId[0] : params.scoutId;
    return raw && UUID_PATTERN.test(raw) ? raw : null;
  }, [params.scoutId]);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || current !== generation.current) throw new Error('ログイン状態を確認できませんでした。');
      const rows = await listJobseekerScouts(pinned.client);
      if (!pinned.isCurrent() || current !== generation.current) return;
      setItems(rows);
      setError(null);
    } catch (cause) {
      if (current !== generation.current) return;
      setError(cause instanceof Error ? cause.message : 'スカウトを読み込めませんでした。');
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [pinCandidateAction]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => { generation.current += 1; };
    }, [load]),
  );

  const submitResponse = useCallback(async (item: JobseekerScout, decision: 'accepted' | 'declined') => {
    if (busyId) return;
    setBusyId(item.scout_id);
    setError(null);
    setNotice(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('ログイン状態を確認できませんでした。');
      await respondToJobseekerScout(pinned.client, item.scout_id, decision);
      if (!pinned.isCurrent()) return;
      const canonical = await listJobseekerScouts(pinned.client);
      if (!pinned.isCurrent()) return;
      setItems(canonical);
      setNotice(decision === 'accepted'
        ? `${item.facility_name}からのスカウトを承諾しました。園からの連絡をお待ちください。`
        : `${item.facility_name}からのスカウトを辞退しました。本人情報は園へ共有されません。`);
    } catch (cause) {
      // A transport error after the mutation may leave the result unknown. Never
      // resend automatically; first reconcile the canonical server state.
      try {
        const pinned = await pinCandidateAction();
        if (pinned) {
          const canonical = await listJobseekerScouts(pinned.client);
          if (pinned.isCurrent()) {
            setItems(canonical);
            const confirmed = canonical.find((row) => row.scout_id === item.scout_id)?.scout_status;
            if (confirmed === decision) {
              setNotice(decision === 'accepted'
                ? `${item.facility_name}からのスカウト承諾を確認しました。`
                : `${item.facility_name}からのスカウト辞退を確認しました。`);
              return;
            }
          }
        }
      } catch {
        // Preserve the original unknown-result error below.
      }
      setError(cause instanceof Error ? cause.message : '回答結果を確認できませんでした。再読込して状態を確認してください。');
    } finally {
      setBusyId(null);
    }
  }, [busyId, pinCandidateAction]);

  const confirmResponse = useCallback((item: JobseekerScout, decision: 'accepted' | 'declined') => {
    const accepting = decision === 'accepted';
    Alert.alert(
      accepting ? 'スカウトを承諾しますか？' : 'スカウトを辞退しますか？',
      accepting
        ? '承諾後は、園が今後の連絡に必要な氏名・メール・電話番号などを確認できるようになります。'
        : '辞退しても、氏名・メール・電話番号などの本人情報は園へ共有されません。',
      [
        { text: '戻る', style: 'cancel' },
        { text: accepting ? '承諾する' : '辞退する', style: accepting ? 'default' : 'destructive', onPress: () => void submitResponse(item, decision) },
      ],
    );
  }, [submitResponse]);

  const pendingCount = items.filter((item) => item.scout_status === 'pending').length;
  const requestedMissing = !loading && requestedScoutId && !items.some((item) => item.scout_id === requestedScoutId);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>ANONYMOUS SCOUT</Text>
        <Text style={styles.title}>スカウト</Text>
        <Text style={styles.body}>匿名プロフィールを見た園からのお誘いです。承諾するまで氏名・メール・電話番号は共有されません。</Text>
      </View>

      <View style={styles.privacyCard}>
        <Text style={styles.cardTitle}>本人情報の共有はあなたが決めます</Text>
        <Text style={styles.body}>回答待ち {pendingCount}件。辞退・期限切れでは本人情報を共有しません。</Text>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.secondaryButton} onPress={() => void load()}><Text style={styles.secondaryButtonText}>再試行</Text></Pressable>
        </View>
      ) : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {requestedMissing ? <Text style={styles.notice}>指定されたスカウトは現在の一覧にありません。最新状態を表示しています。</Text> : null}
      {loading && items.length === 0 ? <ActivityIndicator /> : null}
      {!loading && items.length === 0 && !error ? (
        <View style={styles.emptyCard}>
          <Text style={styles.cardTitle}>スカウトはまだ届いていません</Text>
          <Text style={styles.body}>届いたスカウトはここで確認し、承諾または辞退できます。</Text>
        </View>
      ) : null}

      {items.map((item) => {
        const targeted = requestedScoutId === item.scout_id;
        const busy = busyId === item.scout_id;
        return (
          <View key={item.scout_id} style={[styles.card, targeted && styles.targetCard]}>
            <View style={styles.rowBetween}>
              <View style={styles.statusPill}><Text style={styles.statusText}>{STATUS_LABELS[item.scout_status]}</Text></View>
              <Text style={styles.date}>{dateTime(item.sent_at)}</Text>
            </View>
            <Text style={styles.facility}>{item.facility_name}</Text>
            <Text style={styles.organization}>{item.organization_name}</Text>
            {item.job_title || item.employment_type ? (
              <Text style={styles.jobLine}>{item.job_title || '募集職種'}{item.employment_type ? ` ・ ${item.employment_type}` : ''}</Text>
            ) : null}
            {item.invitation_message ? <Text style={styles.message}>{item.invitation_message}</Text> : null}
            <Text style={styles.meta}>回答期限 {dateTime(item.expires_at)}</Text>

            {item.job_id ? (
              <Pressable style={styles.secondaryButton} onPress={() => router.push(`/job/${item.job_id}` as never)}>
                <Text style={styles.secondaryButtonText}>求人詳細を見る</Text>
              </Pressable>
            ) : null}

            {item.scout_status === 'pending' ? (
              <View style={styles.actions}>
                <Pressable disabled={Boolean(busyId)} style={[styles.secondaryButton, styles.action]} onPress={() => confirmResponse(item, 'declined')}>
                  <Text style={styles.secondaryButtonText}>{busy ? '処理中…' : '辞退する'}</Text>
                </Pressable>
                <Pressable disabled={Boolean(busyId)} style={[styles.primaryButton, styles.action]} onPress={() => confirmResponse(item, 'accepted')}>
                  <Text style={styles.primaryButtonText}>{busy ? '処理中…' : '承諾する'}</Text>
                </Pressable>
              </View>
            ) : null}
            {item.scout_status === 'accepted' ? <Text style={styles.resultText}>承諾済みです。園からの連絡をお待ちください。</Text> : null}
            {item.scout_status === 'declined' ? <Text style={styles.resultText}>辞退済みです。本人情報は共有されません。</Text> : null}
            {item.scout_status === 'expired' ? <Text style={styles.resultText}>回答期限を過ぎています。本人情報は共有されません。</Text> : null}
            {item.scout_status === 'cancelled' ? <Text style={styles.resultText}>園側で取り消されたスカウトです。</Text> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 18, gap: 14, backgroundColor: '#f7f8fa' },
  heading: { gap: 6 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: '#6b7280' },
  title: { fontSize: 28, fontWeight: '800', color: '#191c20' },
  body: { fontSize: 16, color: '#55606d', lineHeight: 23 },
  privacyCard: { backgroundColor: '#fff8ef', borderRadius: 16, padding: 16, gap: 6 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 17, gap: 9, borderWidth: 1, borderColor: '#edf0f3' },
  targetCard: { borderWidth: 2, borderColor: '#191c20' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 7 },
  errorCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  errorText: { fontSize: 16, color: '#a33b32', lineHeight: 22 },
  notice: { fontSize: 16, color: '#315c45', backgroundColor: '#edf8f1', borderRadius: 12, padding: 13, lineHeight: 22 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#191c20' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  statusPill: { backgroundColor: '#f2f4f7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { fontSize: 13, fontWeight: '800', color: '#39414b' },
  date: { fontSize: 13, color: '#7b8490' },
  facility: { fontSize: 21, fontWeight: '800', color: '#191c20' },
  organization: { fontSize: 14, color: '#6b7280' },
  jobLine: { fontSize: 16, fontWeight: '700', color: '#343b44' },
  message: { fontSize: 16, color: '#3f4853', lineHeight: 23, backgroundColor: '#f7f8fa', borderRadius: 12, padding: 13 },
  meta: { fontSize: 13, color: '#6b7280' },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
  primaryButton: { minHeight: 48, backgroundColor: '#191c20', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryButton: { minHeight: 48, borderWidth: 1, borderColor: '#cfd5dc', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryButtonText: { color: '#20262d', fontSize: 16, fontWeight: '800' },
  resultText: { fontSize: 15, color: '#55606d', lineHeight: 21 },
});