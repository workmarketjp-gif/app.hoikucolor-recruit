import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CandidateTabIcon } from '../../components/CandidateTabIcon';
import { CareerExperience } from '../../components/CareerExperience';
import { homeAttentionActions } from '../../lib/homeAttentionActions';
import { useHomeApplicationProgress } from '../../hooks/useHomeApplicationProgress';
import { canShowCalmHomeLinks } from '../../lib/homeCalmNavigation';
import { homeStatRowPresentation } from '../../lib/homeStatRowPresentation';
import { FeaturedHomeJobs } from '../../components/FeaturedHomeJobs';
import { usePrivateScreenCapture } from '../../hooks/usePrivateScreenCapture';
import { useNotifications } from '../../contexts/NotificationContext';

function HomeActionRow({ id, label, icon, count, urgent = false, onPress, stat = false, error = null, onRetry }: {
  id: string;
  label: string;
  icon?: 'briefcase' | 'chat';
  count?: number | null;
  urgent?: boolean;
  onPress: () => void;
  stat?: boolean;
  error?: string | null;
  onRetry?: () => Promise<void>;
}) {
  // Match Web's StatRow: a failed read retries on the same row rather than
  // opening a destination with an unverified, stale or missing count.
  const statPresentation = stat ? homeStatRowPresentation(count ?? null, error ?? null) : null;
  const handlePress = () => {
    if (stat && statPresentation?.retry && onRetry) {
      // The notification provider exposes failures in its state; an onPress
      // callback must not leak a rejected promise to React Native.
      void onRetry().catch(() => undefined);
      return;
    }
    onPress();
  };
  const a11yLabel = stat
    ? (statPresentation?.retry
      ? `${label}をもう一度読み込む`
      : `${label}、${statPresentation?.value ?? '…'}`)
    : `${label}${count === undefined ? '' : count === null ? '、件数未取得' : `、${count}件`}`;
  return (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={handlePress}
      style={[styles.actionRow, stat && styles.statAction, urgent && styles.urgentAction]}
    >
      {icon ? <View style={styles.actionIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <CandidateTabIcon name={icon} color="#AD2450" />
      </View> : null}
      <Text style={[styles.actionLabel, urgent && styles.urgentActionLabel]}>{label}</Text>
      {statPresentation ? (
        <Text style={[styles.actionCount, statPresentation.retry && styles.actionErrorText]}>
          {statPresentation.value}
        </Text>
      ) : count !== undefined ? (
        <Text style={styles.actionCount}>{count === null ? '未取得' : `${count}件`}</Text>
      ) : null}
      <Text style={styles.chevron} importantForAccessibility="no">›</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  // Home now contains private salary conditions: apply the same best-effort
  // platform capture boundary as the dedicated お給料 screen.
  usePrivateScreenCapture('home-career');
  const { user } = useUser();
  const router = useRouter();
  const notifications = useNotifications();
  const name = user?.fullName || user?.firstName || '求職者';
  const summary = notifications.attentionSummary;
  const actions = homeAttentionActions(summary);
  const applicationProgress = useHomeApplicationProgress();
  // The Web suppresses busy attention rows only after BOTH private reads
  // succeeded and all four pending categories are confirmed to be zero.
  const calmHome = canShowCalmHomeLinks({
    applicationCount: applicationProgress.count,
    applicationLoading: applicationProgress.loading,
    applicationError: applicationProgress.error,
    attentionSummary: summary,
    attentionLoaded: notifications.loaded,
    attentionLoading: notifications.loading,
    attentionError: notifications.error,
  });

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {/* The shared shell already owns the brand and notification bell. */}
      <Text style={styles.title}>こんにちは、{name}さん</Text>

      {!calmHome ? (
        <View style={styles.attentionSection}>
          {(actions.interview || actions.scout) ? (
            <View style={styles.urgentList}>
              {actions.interview ? (
                <HomeActionRow id="home-next-interview" label="面接の日程に回答してください"
                  count={actions.interview.count} urgent
                  onPress={() => router.push(actions.interview!.href as never)} />
              ) : null}
              {actions.scout ? (
                <HomeActionRow id="home-pending-scouts" label="届いたスカウト"
                  count={actions.scout.count} urgent
                  onPress={() => router.push(actions.scout!.href as never)} />
              ) : null}
            </View>
          ) : null}
          <View style={styles.statList}>
            <HomeActionRow id="home-applications" label="選考中の応募" icon="briefcase"
              count={applicationProgress.count} stat error={applicationProgress.error}
              onRetry={applicationProgress.refresh}
              onPress={() => router.push(actions.applicationHref)} />
            <HomeActionRow id="home-next-message" label="新着メッセージ" icon="chat"
              count={actions.message.count} stat error={notifications.error}
              onRetry={notifications.refresh}
              onPress={() => router.push(actions.message.href as never)} />
          </View>
          {notifications.error && actions.message.count !== null ? (
            <View style={styles.refreshNotice}>
              <Text style={styles.refreshNoticeText}>新着情報を確認できませんでした。</Text>
              <Pressable accessibilityRole="button" style={styles.refreshButton}
                onPress={() => { void notifications.refresh().catch(() => undefined); }}>
                <Text style={styles.refreshButtonText}>再読み込み</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      <CareerExperience variant="home" />
      {calmHome ? (
        <View style={styles.calmLinks} accessibilityLabel="応募とメッセージ">
          <HomeActionRow id="home-calm-applications" label="応募管理" icon="briefcase"
            onPress={() => router.push(actions.applicationHref)} />
          <HomeActionRow id="home-calm-messages" label="メッセージ" icon="chat"
            onPress={() => router.push('/messages' as never)} />
        </View>
      ) : null}

      <FeaturedHomeJobs />
      {/* Search/spot/matches are in Jobs; saved jobs in Saved; resume/profile
          in My Page. No Native-only marketing cards on the Web Home. */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 32, gap: 18, backgroundColor: '#FFF8FA' },
  title: { fontSize: 22, lineHeight: 30, color: '#30212B', fontWeight: '800', marginVertical: 4 },
  attentionSection: { gap: 12 },
  urgentList: { gap: 8 },
  statList: { gap: 8 },
  actionRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#EEDAE2', borderRadius: 14, backgroundColor: '#FFFFFF',
    paddingHorizontal: 12, paddingVertical: 10 },
  statAction: { minHeight: 64 },
  urgentAction: { backgroundColor: '#FFF0F5', borderColor: '#F6C8D8' },
  actionIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF0F5',
    justifyContent: 'center', alignItems: 'center' },
  actionLabel: { flex: 1, color: '#30212B', fontSize: 16, fontWeight: '700', lineHeight: 24 },
  urgentActionLabel: { color: '#A91E48', fontWeight: '800' },
  actionCount: { fontSize: 16, color: '#BE2455', fontWeight: '800', minWidth: 28, textAlign: 'right' },
  actionErrorText: { color: '#9D3449', fontSize: 13, lineHeight: 20, flexShrink: 1, maxWidth: 140 },
  chevron: { color: '#B55776', fontSize: 22, fontWeight: '600' },
  calmLinks: { gap: 8 },
  refreshNotice: { padding: 12, backgroundColor: '#FFF0F5', borderRadius: 12, gap: 8 },
  refreshNoticeText: { color: '#9D3449', fontSize: 14, lineHeight: 21 },
  refreshButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#CA436A', borderRadius: 10 },
  refreshButtonText: { color: '#9D2146', fontSize: 14, fontWeight: '800' },
});
