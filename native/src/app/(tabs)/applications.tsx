import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import { listApplications, type JobseekerApplicationSummary } from '../../lib/applicationJourneyApi';

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('ja-JP');
}

export default function ApplicationsScreen() {
  const router = useRouter();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [applications, setApplications] = useState<JobseekerApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const rows = await listApplications(pinned.client);
      if (!pinned.isCurrent() || current !== generation.current) return;
      setApplications(rows);
    } catch (loadError) {
      if (current === generation.current) {
        setError(String((loadError as { message?: unknown })?.message ?? loadError));
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [pinCandidateAction]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.heading}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>応募管理</Text>
          <Text style={styles.subtle}>応募後の連絡、面接、見学・体験、選考状況を確認できます。</Text>
        </View>
        <Pressable style={styles.refresh} onPress={() => void load()} disabled={loading}>
          <Text style={styles.refreshText}>更新</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && applications.length === 0 ? <ActivityIndicator /> : null}
      {!loading && applications.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>応募はまだありません</Text>
          <Text style={styles.subtle}>求人を探して、気になる園へ応募するとここに表示されます。</Text>
          <Pressable style={styles.primary} onPress={() => router.push('/(tabs)/jobs')}>
            <Text style={styles.primaryText}>求人を探す</Text>
          </Pressable>
        </View>
      ) : null}

      {applications.map((application) => (
        <Pressable
          key={application.id}
          style={styles.card}
          onPress={() => router.push(`/application/${application.id}` as never)}
          accessibilityRole="button"
          accessibilityLabel={`${application.facility_name} ${application.job_title}の応募詳細`}
        >
          <View style={styles.cardTop}>
            <Text style={styles.jobTitle}>{application.job_title}</Text>
            <Text style={styles.status}>{application.status}</Text>
          </View>
          <Text style={styles.facility}>{application.facility_name}</Text>
          <Text style={styles.subtle}>
            {[application.prefecture, application.city, application.employment_type].filter(Boolean).join(' ・ ')}
          </Text>
          <Text style={styles.meta}>応募日 {formatDate(application.applied_at)}</Text>
          <Text style={styles.open}>詳細を開く →</Text>
        </Pressable>
      ))}

      <Pressable style={styles.secondary} onPress={() => router.push('/visits' as never)}>
        <Text style={styles.secondaryText}>見学・体験の予約一覧</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, backgroundColor: '#f7f8fa', flexGrow: 1 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 24, fontWeight: '900', marginBottom: 4 },
  subtle: { color: '#606873', lineHeight: 20 },
  refresh: { borderWidth: 1, borderColor: '#d7dce2', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#fff' },
  refreshText: { fontWeight: '800' },
  error: { color: '#b42318', backgroundColor: '#fff1f0', padding: 12, borderRadius: 10 },
  empty: { backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  primary: { minHeight: 46, borderRadius: 12, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 6 },
  cardTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  jobTitle: { flex: 1, fontSize: 18, fontWeight: '800' },
  facility: { fontWeight: '700' },
  status: { fontSize: 12, fontWeight: '800', backgroundColor: '#eef0f3', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, overflow: 'hidden' },
  meta: { color: '#7a818b', fontSize: 12 },
  open: { fontWeight: '800', marginTop: 5 },
  secondary: { minHeight: 46, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontWeight: '800' },
});
