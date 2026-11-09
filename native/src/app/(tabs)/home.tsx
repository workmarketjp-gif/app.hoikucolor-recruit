import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CareerExperience } from '../../components/CareerExperience';
import { FeaturedHomeJobs } from '../../components/FeaturedHomeJobs';
import { usePrivateScreenCapture } from '../../hooks/usePrivateScreenCapture';
import { useNotifications } from '../../contexts/NotificationContext';

function Metric({ value, label }: { value: number | null; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value == null ? '—' : value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
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

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.greeting}>
        <Image source={require('../../../assets/hoiku-color-mark.png')} style={styles.mark} resizeMode="contain" />
        <Text style={styles.eyebrow}>保育のお仕事探し</Text>
        <Text style={styles.title}>{name}さん</Text>
        <Text style={styles.subtle}>求人探しから応募後の連絡まで、ここから進められます。</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>今やること</Text>
          <Pressable onPress={() => router.push('/(tabs)/notifications')}>
            <Text style={styles.link}>通知を見る</Text>
          </Pressable>
        </View>
        <View style={styles.metrics}>
          <Metric value={summary?.unanswered_interviews_count ?? null} label="面接回答" />
          <Metric value={summary?.unread_messages_count ?? null} label="未読連絡" />
          <Metric value={summary?.pending_scouts_count ?? null} label="スカウト" />
        </View>
        {notifications.error ? <Text style={styles.subtle}>{notifications.error}</Text> : null}
        {notifications.unreadCount != null ? (
          <Text style={styles.subtle}>通知センター未読 {notifications.unreadCount} 件</Text>
        ) : null}
        <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => router.push('/messages' as never)}>
          <Text style={styles.secondaryButtonText}>メッセージを確認する</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => router.push('/(tabs)/applications')}>
          <Text style={styles.secondaryButtonText}>応募管理を開く</Text>
        </Pressable>
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
  link: { fontWeight: '700', textDecorationLine: 'underline' },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, backgroundColor: '#f2f4f7', borderRadius: 12, padding: 12 },
  metricValue: { fontSize: 24, fontWeight: '800' },
  metricLabel: { fontSize: 12, color: '#606873', marginTop: 3 },
  primaryButton: { minHeight: 48, backgroundColor: '#FF2F5F', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderColor: '#E8C6D1', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryButtonText: { fontWeight: '800' },
});
