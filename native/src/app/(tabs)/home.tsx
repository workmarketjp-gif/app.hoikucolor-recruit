import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNotifications } from '../../contexts/NotificationContext';

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { user } = useUser();
  const router = useRouter();
  const notifications = useNotifications();
  const name = user?.fullName || user?.firstName || '求職者';
  const summary = notifications.attentionSummary;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View>
        <Text style={styles.eyebrow}>JOBSEEKER</Text>
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
          <Metric value={summary.unanswered_interviews_count} label="面接回答" />
          <Metric value={summary.unread_messages_count} label="未読連絡" />
          <Metric value={summary.pending_scouts_count} label="スカウト" />
        </View>
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
  page: { padding: 20, gap: 16, backgroundColor: '#f7f8fa' },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4, color: '#6b7280' },
  title: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  subtle: { color: '#606873', lineHeight: 21, marginTop: 5 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, gap: 12 },
  sectionTitle: { fontSize: 19, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontWeight: '700', textDecorationLine: 'underline' },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, backgroundColor: '#f2f4f7', borderRadius: 12, padding: 12 },
  metricValue: { fontSize: 24, fontWeight: '800' },
  metricLabel: { fontSize: 12, color: '#606873', marginTop: 3 },
  primaryButton: { minHeight: 48, backgroundColor: '#191c20', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryButtonText: { fontWeight: '800' },
});
