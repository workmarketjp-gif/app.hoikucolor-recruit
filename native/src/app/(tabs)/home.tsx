import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CareerExperience } from '../../components/CareerExperience';
import { homeAttentionActions } from '../../lib/homeAttentionActions';
import { FeaturedHomeJobs } from '../../components/FeaturedHomeJobs';
import { usePrivateScreenCapture } from '../../hooks/usePrivateScreenCapture';
import { useNotifications } from '../../contexts/NotificationContext';

function HomeActionRow({ id, label, count, urgent = false, onPress }: {
  id: string; label: string; count?: number | null; urgent?: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={`${label}${count === undefined ? '' : count === null ? '、件数未取得' : `、${count}件`}`}
      onPress={onPress}
      style={[styles.actionRow, urgent && styles.urgentAction]}
    >
      <Text style={[styles.actionLabel, urgent && styles.urgentActionLabel]}>{label}</Text>
      {count !== undefined ? (
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

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.greeting}>
        <Image source={require('../../../assets/hoiku-color-mark.png')} style={styles.mark} resizeMode="contain" />
        <Text style={styles.eyebrow}>保育のお仕事探し</Text>
        <Text style={styles.title}>こんにちは、{name}さん</Text>
        <Text style={styles.subtle}>求人探しから応募後の連絡まで、ここから進められます。</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>いま確認すること</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="通知一覧を開く"
            onPress={() => router.push('/(tabs)/notifications')} style={styles.inlineLink}>
            <Text style={styles.link}>通知を見る</Text>
          </Pressable>
        </View>
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
        <HomeActionRow id="home-applications" label="応募管理"
          onPress={() => router.push(actions.applicationHref)} />
        <HomeActionRow id="home-next-message" label="新着メッセージ"
          count={actions.message.count}
          onPress={() => router.push(actions.message.href as never)} />
        {notifications.error ? (
          <View style={styles.refreshNotice}>
            <Text style={styles.refreshNoticeText}>新着情報を確認できませんでした。</Text>
            <Pressable accessibilityRole="button" style={styles.refreshButton}
              onPress={() => void notifications.refresh()}>
              <Text style={styles.refreshButtonText}>再読み込み</Text>
            </Pressable>
          </View>
        ) : null}
        {notifications.unreadCount != null ? (
          <Text style={styles.subtle}>通知センター未読 {notifications.unreadCount} 件</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>求人を探す</Text>
        <Text style={styles.subtle}>気になる求人は保存し、最大3件をその場で比較できます。</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.push('/(tabs)/jobs')}>
          <Text style={styles.primaryButtonText}>求人検索を開く</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push('/(tabs)/saved')}>
          <Text style={styles.secondaryButtonText}>保存した求人を見る</Text>
        </Pressable>
      </View>

      <CareerExperience variant="home" />
      <FeaturedHomeJobs />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>あなたに合う園を探す</Text>
        <Text style={styles.subtle}>希望条件や保育観から探したり、1日単位のスポット勤務を確認できます。</Text>
        <Pressable style={styles.secondaryButton} onPress={() => router.push('/matches' as never)}>
          <Text style={styles.secondaryButtonText}>マッチ度順で見る</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push('/spot-jobs' as never)}>
          <Text style={styles.secondaryButtonText}>スポット勤務を見る</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>応募準備</Text>
        <Text style={styles.subtle}>プロフィールと履歴書・資格証などの応募書類をスマホで管理できます。</Text>
        <Pressable style={styles.secondaryButton} onPress={() => router.push('/(tabs)/profile')}>
          <Text style={styles.secondaryButtonText}>プロフィール・書類を確認</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 30, gap: 16, backgroundColor: '#FFF8FA' },
  greeting: { gap: 6, paddingVertical: 8 },
  mark: { width: 42, height: 42 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.1, color: '#D92856' },
  title: { fontSize: 27, color: '#2A202A', fontWeight: '800', marginTop: 4 },
  subtle: { color: '#68616B', lineHeight: 22, fontSize: 14, marginTop: 5 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 18, gap: 12, borderColor: '#F5DDE5', borderWidth: 1 },
  sectionTitle: { fontSize: 19, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: '#BE2455', fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  inlineLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  actionRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#F0DDE5', borderRadius: 14, backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 10 },
  urgentAction: { backgroundColor: '#FFF0F5', borderColor: '#F6C8D8' },
  actionLabel: { flex: 1, color: '#30212B', fontSize: 15, fontWeight: '700', lineHeight: 22 },
  urgentActionLabel: { color: '#A91E48', fontWeight: '800' },
  actionCount: { fontSize: 15, color: '#BE2455', fontWeight: '800', minWidth: 28, textAlign: 'right' },
  chevron: { color: '#B55776', fontSize: 22, fontWeight: '600' },
  refreshNotice: { padding: 12, backgroundColor: '#FFF8FA', borderRadius: 12, gap: 8 },
  refreshNoticeText: { color: '#9D3449', fontSize: 14, lineHeight: 21 },
  refreshButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#CA436A', borderRadius: 10 },
  refreshButtonText: { color: '#9D2146', fontSize: 14, fontWeight: '800' },
  primaryButton: { minHeight: 48, backgroundColor: '#FF2F5F', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderColor: '#E8C6D1', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryButtonText: { fontWeight: '800' },
});
