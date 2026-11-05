import { useSession } from '@clerk/expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { usePrivateDataQuarantine } from '../hooks/usePrivateDataQuarantine';
import { usePrivateScreenCapture } from '../hooks/usePrivateScreenCapture';
import { getJobseekerAttentionSummary, type JobseekerAttentionSummary } from '../lib/attentionApi';
import { listApplications, type JobseekerApplicationSummary } from '../lib/applicationJourneyApi';
import { candidateViewOwnerKey, readCandidateFreshlyVerifiedView, type CandidateOwnedView } from '../lib/candidateViewOwner';
import { buildMessageInbox } from '../lib/messageInbox';

/** Web /messages: only authorized application threads, with canonical unread metadata. */
export default function MessagesScreen() {
  usePrivateScreenCapture('messages');
  const router = useRouter();
  const { session } = useSession();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const privacy = usePrivateDataQuarantine();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const [applications, setApplications] = useState<CandidateOwnedView<JobseekerApplicationSummary[]> | null>(null);
  const [attention, setAttention] = useState<CandidateOwnedView<JobseekerAttentionSummary> | null>(null);
  const [loadError, setLoadError] = useState<CandidateOwnedView<string> | null>(null);
  const [attentionFailed, setAttentionFailed] = useState<CandidateOwnedView<boolean> | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  // Cached threads need a fresh canonical read after App Lock, even for the same session.
  const freshlyVerifiedOwner = useRef<string | null>(null);
  const canRead = !privacy.shieldVisible && privacy.canAccessPrivateData();
  if (!canRead) freshlyVerifiedOwner.current = null;

  const load = useCallback(async () => {
    const request = ++generation.current;
    freshlyVerifiedOwner.current = null;
    setApplications(null);
    setAttention(null);
    setLoadError(null);
    setAttentionFailed(null);
    setLoading(true);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || !pinned.isCurrent()) throw new Error('ログイン状態を確認できませんでした。');
      const requestOwner = candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId);
      if (!requestOwner) throw new Error('ログイン状態を確認できませんでした。');
      const [applicationsRead, attentionRead] = await Promise.allSettled([
        listApplications(pinned.client),
        getJobseekerAttentionSummary(pinned.client),
      ]);
      if (request !== generation.current || !pinned.isCurrent() || !privacy.canAccessPrivateData()) return;
      if (applicationsRead.status === 'rejected') throw applicationsRead.reason;
      freshlyVerifiedOwner.current = requestOwner;
      setApplications({ ownerKey: requestOwner, value: applicationsRead.value });
      if (attentionRead.status === 'fulfilled') {
        setAttention({ ownerKey: requestOwner, value: attentionRead.value });
      } else {
        // Do not infer 0 unread or 0 scouts from a failed authoritative read.
        setAttentionFailed({ ownerKey: requestOwner, value: true });
      }
    } catch (error) {
      if (request === generation.current && ownerKey && privacy.canAccessPrivateData()) {
        freshlyVerifiedOwner.current = ownerKey;
        setLoadError({ ownerKey, value: String((error as { message?: unknown })?.message ?? error) });
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [pinCandidateAction, ownerKey, privacy.canAccessPrivateData]);

  // A reply in the application detail can change unread counts and thread state.
  // Revalidate on screen focus; blur revokes the old presentation lease *before*
  // this stack screen can be shown again, including after App Lock.
  useFocusEffect(useCallback(() => {
    if (!ownerKey || privacy.shieldVisible || !privacy.canAccessPrivateData()) {
      generation.current += 1;
      freshlyVerifiedOwner.current = null;
      setApplications(null);
      setAttention(null);
      setLoadError(null);
      setAttentionFailed(null);
      setLoading(true);
      return;
    }
    void load();
    return () => {
      generation.current += 1;
      freshlyVerifiedOwner.current = null;
    };
  }, [ownerKey, privacy.shieldVisible, privacy.canAccessPrivateData, load]));

  const visibleApplications = readCandidateFreshlyVerifiedView(applications, ownerKey, canRead, freshlyVerifiedOwner.current);
  const visibleAttention = readCandidateFreshlyVerifiedView(attention, ownerKey, canRead, freshlyVerifiedOwner.current);
  const error = readCandidateFreshlyVerifiedView(loadError, ownerKey, canRead, freshlyVerifiedOwner.current);
  const warning = readCandidateFreshlyVerifiedView(attentionFailed, ownerKey, canRead, freshlyVerifiedOwner.current);
  const inbox = buildMessageInbox(visibleApplications ?? [], visibleAttention);
  const openThread = async (applicationId: string) => {
    if (!visibleApplications || !inbox.rows.some((row) => row.applicationId === applicationId)) return;
    const pinned = await pinCandidateAction();
    if (!pinned?.isCurrent() || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) return;
    router.push(`/application/${applicationId}?focus=messages` as never);
  };

  if (!canRead || !ownerKey) return <View style={styles.center}><ActivityIndicator color="#FF2F5F" /></View>;
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>メッセージ</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="メッセージを更新" onPress={() => void load()} disabled={loading}>
          <Text style={styles.refresh}>更新</Text>
        </Pressable>
      </View>
      {loading && !visibleApplications ? <ActivityIndicator color="#FF2F5F" /> : null}
      {error ? <View style={styles.alert}>
        <Text style={styles.error}>{error}</Text>
        <Pressable accessibilityRole="button" style={styles.outline} onPress={() => void load()}><Text style={styles.action}>再試行</Text></Pressable>
      </View> : null}
      {warning ? <Text style={styles.warning}>新着メッセージの件数を確認できませんでした。更新してご確認ください。</Text> : null}
      {visibleApplications && !error && inbox.unreadCount !== null && inbox.unreadCount > 0 && inbox.newestApplicationId ? (
        <Pressable accessibilityRole="button" style={styles.highlight} onPress={() => void openThread(inbox.newestApplicationId!)}>
          <Text style={styles.highlightText}>新着メッセージを読む</Text>
          <Text style={styles.highlightText}>{inbox.unreadCount}件 ›</Text>
        </Pressable>
      ) : null}
      <Text style={styles.section}>応募先とのやりとり</Text>
      {visibleApplications && !error && inbox.rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>メッセージはまだありません</Text>
          <Text style={styles.muted}>応募すると、園とのやりとりがここに表示されます。</Text>
          <Pressable accessibilityRole="button" style={styles.outline} onPress={() => router.push('/(tabs)/jobs')}>
            <Text style={styles.action}>求人を探す</Text>
          </Pressable>
        </View>
      ) : null}
      {visibleApplications && !error ? inbox.rows.map((row) => (
        <Pressable key={row.applicationId} accessibilityRole="button" accessibilityLabel={`${row.facilityName}のメッセージを開く`}
          style={styles.thread} onPress={() => void openThread(row.applicationId)}>
          <View style={styles.threadBody}>
            <Text style={styles.facility}>{row.facilityName}</Text>
            <Text style={styles.muted}>{row.jobTitle} ・ {row.statusLabel}</Text>
          </View>
          {row.hasNewestUnread ? <Text style={styles.badge}>新着</Text> : null}
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )) : null}
      {visibleApplications && !error ? <>
        <Text style={styles.section}>園からのスカウト</Text>
        <Pressable accessibilityRole="button" style={styles.thread} onPress={() => router.push('/scouts' as never)}>
          <View style={styles.threadBody}>
            <Text style={styles.facility}>スカウトを見る</Text>
            <Text style={styles.muted}>{inbox.pendingScouts !== null && inbox.pendingScouts > 0
              ? `返事を待っているスカウトが${inbox.pendingScouts}件あります`
              : '園から届いたお誘いを確認できます'}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  page: { padding: 16, paddingBottom: 32, gap: 12, backgroundColor: '#FFF8FA', flexGrow: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '900', color: '#16181D' },
  refresh: { color: '#BC244F', fontWeight: '800', fontSize: 15, padding: 10 },
  section: { fontSize: 19, fontWeight: '800', color: '#16181D', paddingTop: 7 },
  thread: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderRadius: 16, backgroundColor: '#fff' },
  threadBody: { flex: 1, gap: 5 },
  facility: { fontSize: 16, fontWeight: '800', color: '#16181D' },
  muted: { color: '#606873', lineHeight: 20, fontSize: 14 },
  chevron: { color: '#8a909b', fontSize: 24 },
  badge: { color: '#AE244E', fontSize: 12, fontWeight: '800', backgroundColor: '#FFF0F4', padding: 7, borderRadius: 8, overflow: 'hidden' },
  highlight: { minHeight: 54, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF0F4', borderColor: '#E84465', borderWidth: 1, padding: 16, borderRadius: 14 },
  highlightText: { fontSize: 15, fontWeight: '800', color: '#AA1F49' },
  alert: { padding: 14, gap: 12, backgroundColor: '#FFF1F0', borderRadius: 14 },
  error: { color: '#B42318', fontSize: 15 },
  warning: { color: '#8A4B00', backgroundColor: '#FFF8E6', padding: 12, borderRadius: 10 },
  empty: { gap: 12, padding: 18, backgroundColor: '#fff', borderRadius: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '800' },
  outline: { minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', borderColor: '#D7DCE2', borderWidth: 1, borderRadius: 12 },
  action: { fontSize: 15, fontWeight: '800', color: '#16181D' },
});
