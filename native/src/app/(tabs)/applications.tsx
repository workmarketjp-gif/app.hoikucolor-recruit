import { useSession } from '@clerk/expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import { listApplications, type JobseekerApplicationSummary } from '../../lib/applicationJourneyApi';
import { usePrivateScreenCapture } from '../../hooks/usePrivateScreenCapture';
import { usePrivateDataQuarantine } from '../../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey, readCandidateFreshlyVerifiedView, type CandidateOwnedView } from '../../lib/candidateViewOwner';
import { applicationStatusLabel } from '../../lib/messageInbox';

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('ja-JP');
}

export default function ApplicationsScreen() {
  usePrivateScreenCapture('applications');
  const router = useRouter();
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [ownedApplications, setOwnedApplications] = useState<CandidateOwnedView<JobseekerApplicationSummary[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownedError, setOwnedError] = useState<CandidateOwnedView<string> | null>(null);
  const generation = useRef(0);
  const privateAllowed = !privacy.shieldVisible && privacy.canAccessPrivateData();
  // Invalidate synchronously when App Lock/foreground closes. A prior result
  // must not flash on unlock before a new authorized read completes.
  const freshlyVerifiedOwner = useRef<string | null>(null);
  if (!privateAllowed) freshlyVerifiedOwner.current = null;
  const applications = readCandidateFreshlyVerifiedView(ownedApplications, ownerKey, privateAllowed, freshlyVerifiedOwner.current);
  const error = readCandidateFreshlyVerifiedView(ownedError, ownerKey, privateAllowed, freshlyVerifiedOwner.current);

  const load = useCallback(async () => {
    const current = ++generation.current;
    freshlyVerifiedOwner.current = null;
    setLoading(true);
    setOwnedApplications(null);
    setOwnedError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const rows = await listApplications(pinned.client);
      if (!pinned.isCurrent() || current !== generation.current || !privacy.canAccessPrivateData()) return;
      const verifiedOwner = candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId)!;
      freshlyVerifiedOwner.current = verifiedOwner;
      setOwnedApplications({ ownerKey: verifiedOwner, value: rows });
    } catch (loadError) {
      if (current === generation.current) {
        if (ownerKey && privacy.canAccessPrivateData()) {
          freshlyVerifiedOwner.current = ownerKey;
          setOwnedError({ ownerKey, value: String((loadError as { message?: unknown })?.message ?? loadError) });
        }
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [ownerKey, pinCandidateAction, privacy.canAccessPrivateData]);

  // A return from details/interview/application submission must read the
  // canonical status anew. Blur revokes the lease and invalidates in-flight RPCs.
  useFocusEffect(useCallback(() => {
    if (!ownerKey || !privateAllowed) {
      generation.current += 1;
      freshlyVerifiedOwner.current = null;
      setOwnedApplications(null);
      setOwnedError(null);
      setLoading(true);
      return;
    }
    void load();
    return () => {
      generation.current += 1;
      freshlyVerifiedOwner.current = null;
    };
  }, [ownerKey, privateAllowed, load]));

  const openApplication = async (applicationId: string) => {
    if (!privateAllowed || !applications?.some((application) => application.id === applicationId)) return;
    const pinned = await pinCandidateAction();
    if (!pinned?.isCurrent() || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) return;
    router.push(`/application/${applicationId}` as never);
  };

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
      {(loading || (applications === null && !error)) ? <ActivityIndicator /> : null}
      {!loading && !error && applications?.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>応募はまだありません</Text>
          <Text style={styles.subtle}>求人を探して、気になる園へ応募するとここに表示されます。</Text>
          <Pressable style={styles.primary} onPress={() => router.push('/(tabs)/jobs')}>
            <Text style={styles.primaryText}>求人を探す</Text>
          </Pressable>
        </View>
      ) : null}

      {(applications ?? []).map((application) => (
        <Pressable
          key={application.id}
          style={styles.card}
          onPress={() => void openApplication(application.id)}
          accessibilityRole="button"
          accessibilityLabel={`${application.facility_name} ${application.job_title}の応募詳細`}
        >
          <View style={styles.cardTop}>
            <Text style={styles.jobTitle}>{application.job_title}</Text>
            <Text style={styles.status}>{applicationStatusLabel(application.status)}</Text>
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
