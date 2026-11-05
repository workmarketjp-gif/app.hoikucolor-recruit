import { useSession } from '@clerk/expo';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { usePrivateDataQuarantine } from '../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey, readCandidateFreshlyVerifiedView, type CandidateOwnedView } from '../lib/candidateViewOwner';
import { canCancelVisibleVisit, canRequestVisibleVisit, visitReadbackConfirmsMutation } from '../lib/visitPresentation';
import {
  cancelVisit,
  getVisitSettings,
  listCandidateVisits,
  requestVisitDurable,
  type JobseekerVisitHistory,
  type JobseekerVisitSettings,
  type VisitExperienceType,
} from '../lib/applicationJourneyApi';
import { usePrivateScreenCapture } from '../hooks/usePrivateScreenCapture';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string | null) {
  if (!value) return '未設定';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP');
}

function experienceLabel(value: VisitExperienceType) {
  if (value === 'visit') return '園見学';
  if (value === 'half_day_trial') return '半日体験';
  return '1日体験';
}

function allowedTypes(settings: JobseekerVisitSettings | null): VisitExperienceType[] {
  if (!settings) return [];
  const values: VisitExperienceType[] = [];
  if (settings.visit_enabled) values.push('visit');
  if (settings.half_day_trial_enabled) values.push('half_day_trial');
  if (settings.full_day_trial_enabled) values.push('full_day_trial');
  return values;
}

export default function VisitsScreen() {
  usePrivateScreenCapture('visits');
  const params = useLocalSearchParams<{ visitId?: string | string[]; jobId?: string | string[]; applicationId?: string | string[] }>();
  const router = useRouter();
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const { pinCandidateAction } = usePinnedCandidateAction();
  const focusedVisitId = firstParam(params.visitId) ?? null;
  const jobId = firstParam(params.jobId) ?? null;
  const applicationId = firstParam(params.applicationId) ?? null;
  const [ownedVisits, setOwnedVisits] = useState<CandidateOwnedView<JobseekerVisitHistory[]> | null>(null);
  const [ownedSettings, setOwnedSettings] = useState<CandidateOwnedView<JobseekerVisitSettings | null> | null>(null);
  const [experienceType, setExperienceType] = useState<VisitExperienceType>('visit');
  const [localDate, setLocalDate] = useState('');
  const [localTime, setLocalTime] = useState('');
  const [candidateMessage, setCandidateMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ownedError, setOwnedError] = useState<CandidateOwnedView<string> | null>(null);
  const generation = useRef(0);
  // A same-session App Lock/unlock also invalidates every previously rendered visit.
  const freshlyVerifiedOwner = useRef<string | null>(null);
  const privateAllowed = !privacy.shieldVisible && privacy.canAccessPrivateData();
  if (!privateAllowed) freshlyVerifiedOwner.current = null;
  const visits = readCandidateFreshlyVerifiedView(ownedVisits, ownerKey, privateAllowed, freshlyVerifiedOwner.current);
  const settings = readCandidateFreshlyVerifiedView(ownedSettings, ownerKey, privateAllowed, freshlyVerifiedOwner.current);
  const error = readCandidateFreshlyVerifiedView(ownedError, ownerKey, privateAllowed, freshlyVerifiedOwner.current);

  const load = useCallback(async (expected?: { reservationId: string; mutation: 'request' | 'cancel' }): Promise<boolean> => {
    const current = ++generation.current;
    freshlyVerifiedOwner.current = null;
    setOwnedVisits(null);
    setOwnedSettings(null);
    setOwnedError(null);
    setLoading(true);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned?.isCurrent()) throw new Error('安全なログイン状態を確認できませんでした。');
      const requestOwner = candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId);
      if (!requestOwner) throw new Error('安全なログイン状態を確認できませんでした。');
      const [nextVisits, nextSettings] = await Promise.all([
        listCandidateVisits(pinned.client),
        jobId ? getVisitSettings(pinned.client, jobId) : Promise.resolve(null),
      ]);
      if (!pinned.isCurrent() || current !== generation.current || !privacy.canAccessPrivateData()) return false;
      if (expected && !visitReadbackConfirmsMutation(nextVisits, expected.reservationId, expected.mutation)) {
        throw new Error('操作は送信されましたが、最新の予約状態を確認できません。更新して確認してください。再送信はしないでください。');
      }
      freshlyVerifiedOwner.current = requestOwner;
      setOwnedVisits({ ownerKey: requestOwner, value: nextVisits });
      setOwnedSettings({ ownerKey: requestOwner, value: nextSettings });
      const available = allowedTypes(nextSettings);
      setExperienceType((previous) => available.includes(previous) ? previous : available[0] ?? 'visit');
      return true;
    } catch (loadError) {
      if (current === generation.current && ownerKey && privacy.canAccessPrivateData()) {
        freshlyVerifiedOwner.current = ownerKey;
        setOwnedError({ ownerKey, value: String((loadError as { message?: unknown })?.message ?? loadError) });
      }
      return false;
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [jobId, ownerKey, pinCandidateAction, privacy.canAccessPrivateData]);

  useFocusEffect(useCallback(() => {
    if (!ownerKey || !privateAllowed) {
      generation.current += 1;
      freshlyVerifiedOwner.current = null;
      setOwnedVisits(null);
      setOwnedSettings(null);
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

  // A previous account's private booking draft must not survive session change
  // or an App Lock boundary, even if the screen remains mounted.
  useEffect(() => {
    setLocalDate('');
    setLocalTime('');
    setCandidateMessage('');
    setExperienceType('visit');
  }, [ownerKey, privacy.shieldVisible]);

  const availableTypes = allowedTypes(settings);
  const canRequest = privateAllowed && !loading && !busy && !error &&
    canRequestVisibleVisit(
      ownerKey, freshlyVerifiedOwner.current, jobId,
      availableTypes, experienceType, localDate, localTime,
    );

  const requestVisit = async () => {
    if (!canRequest || !jobId) return;
    setBusy(true);
    setOwnedError(null);
    const pinned = await pinCandidateAction();
    try {
      if (!pinned?.isCurrent() || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) return;
      const reservationId = await requestVisitDurable({
        client: pinned.client,
        ownerId: pinned.ownerId,
        ownerSessionId: pinned.ownerSessionId,
        jobId,
        applicationId,
        experienceType,
        localDate,
        localTime,
        candidateMessage,
      });
      if (!pinned.isCurrent()) return;
      // A successful mutation response is not proof of visible saved state.
      const confirmed = await load({ reservationId, mutation: 'request' });
      if (!confirmed || !pinned.isCurrent()) return;
      setCandidateMessage('');
      router.replace(`/visits?visitId=${encodeURIComponent(reservationId)}&jobId=${encodeURIComponent(jobId)}${applicationId ? `&applicationId=${encodeURIComponent(applicationId)}` : ''}` as never);
    } catch (requestError) {
      if (pinned?.isCurrent() && ownerKey) {
        freshlyVerifiedOwner.current = ownerKey;
        setOwnedError({ ownerKey, value: String((requestError as { message?: unknown })?.message ?? requestError) });
      }
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (reservationId: string) => {
    if (busy || !privateAllowed ||
      !canCancelVisibleVisit(ownerKey, freshlyVerifiedOwner.current, visits, reservationId)) return;
    setBusy(true);
    setOwnedError(null);
    const pinned = await pinCandidateAction();
    try {
      if (!pinned?.isCurrent() || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) return;
      await cancelVisit(pinned.client, reservationId);
      if (!pinned.isCurrent()) return;
      await load({ reservationId, mutation: 'cancel' });
    } catch (cancelError) {
      if (pinned?.isCurrent() && ownerKey) {
        freshlyVerifiedOwner.current = ownerKey;
        setOwnedError({ ownerKey, value: String((cancelError as { message?: unknown })?.message ?? cancelError) });
      }
    } finally {
      setBusy(false);
    }
  };

  const openRelatedApplication = async (reservationId: string, targetApplicationId: string) => {
    if (!privateAllowed || !visits?.some((visit) =>
      visit.reservation_id === reservationId && visit.application_id === targetApplicationId)) return;
    const pinned = await pinCandidateAction();
    if (!pinned?.isCurrent() || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerKey) return;
    router.push(`/application/${targetApplicationId}` as never);
  };

  const visibleVisits = useMemo(() => {
    if (!visits) return [];
    if (!focusedVisitId) return visits;
    return [...visits].sort((a, b) => Number(b.reservation_id === focusedVisitId) - Number(a.reservation_id === focusedVisitId));
  }, [focusedVisitId, visits]);

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={styles.title}>見学・体験</Text>
        <Text style={styles.subtle}>園見学・半日体験・1日体験の予約と結果を確認できます。</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {(loading || (visits === null && !error)) ? <ActivityIndicator /> : null}
      {error && privateAllowed ? (
        <Pressable style={styles.secondary} onPress={() => void load()} disabled={loading}>
          <Text style={styles.secondaryText}>予約情報を再取得</Text>
        </Pressable>
      ) : null}

      {jobId && settings ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>新しい予約</Text>
          {settings.public_note ? <Text style={styles.subtle}>{settings.public_note}</Text> : null}
          {availableTypes.length === 0 ? <Text style={styles.subtle}>この園では現在、見学・体験予約を受け付けていません。</Text> : null}
          <View style={styles.typeRow}>
            {availableTypes.map((type) => (
              <Pressable
                key={type}
                style={[styles.typeButton, experienceType === type && styles.typeButtonSelected]}
                onPress={() => setExperienceType(type)}
              >
                <Text style={styles.typeButtonText}>{experienceLabel(type)}</Text>
              </Pressable>
            ))}
          </View>
          {availableTypes.length ? (
            <>
              <TextInput value={localDate} onChangeText={setLocalDate} placeholder="希望日 YYYY-MM-DD" autoCapitalize="none" style={styles.input} />
              <TextInput value={localTime} onChangeText={setLocalTime} placeholder={`希望時刻 HH:MM（${settings.first_start_time}〜${settings.last_start_time}）`} autoCapitalize="none" style={styles.input} />
              <TextInput value={candidateMessage} onChangeText={setCandidateMessage} placeholder="園への連絡事項（任意）" multiline style={styles.textArea} />
              <Pressable style={styles.primary} disabled={!canRequest} onPress={() => void requestVisit()}>
                <Text style={styles.primaryText}>{busy ? '予約を確認中…' : '見学・体験を申し込む'}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>予約履歴</Text>
        {!loading && visits !== null && visibleVisits.length === 0 ? <Text style={styles.subtle}>予約履歴はありません。</Text> : null}
        {visibleVisits.map((visit) => {
          const focused = visit.reservation_id === focusedVisitId;
          const cancellable = visit.status === 'requested' || visit.status === 'confirmed';
          return (
            <View key={visit.reservation_id} style={[styles.visitCard, focused && styles.focusedCard]}>
              {focused ? <Text style={styles.focusLabel}>通知からこの予約を開きました</Text> : null}
              <Text style={styles.visitTitle}>{experienceLabel(visit.experience_type)} ・ {visit.facility_name}</Text>
              <Text style={styles.subtle}>{visit.job_title}</Text>
              <Text>{formatDateTime(visit.starts_at)} 〜 {formatDateTime(visit.ends_at)}</Text>
              <Text style={styles.status}>{visit.status}</Text>
              {visit.candidate_message ? <Text style={styles.subtle}>連絡事項: {visit.candidate_message}</Text> : null}
              {cancellable ? (
                <Pressable style={styles.secondary} disabled={busy || !canCancelVisibleVisit(ownerKey, freshlyVerifiedOwner.current, visits, visit.reservation_id)} onPress={() => void cancel(visit.reservation_id)}>
                  <Text style={styles.secondaryText}>予約をキャンセル</Text>
                </Pressable>
              ) : null}
              {visit.application_id ? (
                <Pressable style={styles.linkButton} onPress={() => void openRelatedApplication(visit.reservation_id, visit.application_id!)}>
                  <Text style={styles.link}>関連する応募を開く</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      <Pressable style={styles.secondary} onPress={() => router.push('/(tabs)/applications')}>
        <Text style={styles.secondaryText}>応募管理へ戻る</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, backgroundColor: '#f7f8fa' },
  title: { fontSize: 24, fontWeight: '900', marginBottom: 4 },
  subtle: { color: '#606873', lineHeight: 20 },
  error: { color: '#b42318', backgroundColor: '#fff1f0', padding: 12, borderRadius: 10 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeButton: { borderWidth: 1, borderColor: '#d7dce2', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  typeButtonSelected: { backgroundColor: '#edf4ff', borderColor: '#246bfd' },
  typeButtonText: { fontWeight: '800' },
  input: { borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 },
  textArea: { minHeight: 80, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, padding: 12, textAlignVertical: 'top' },
  primary: { minHeight: 48, borderRadius: 12, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '900' },
  visitCard: { borderWidth: 1, borderColor: '#e0e4e9', borderRadius: 12, padding: 12, gap: 6 },
  focusedCard: { borderWidth: 2, borderColor: '#246bfd' },
  focusLabel: { color: '#155eef', fontWeight: '800' },
  visitTitle: { fontSize: 16, fontWeight: '800' },
  status: { fontWeight: '800' },
  secondary: { minHeight: 44, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryText: { fontWeight: '800' },
  linkButton: { paddingVertical: 5 },
  link: { fontWeight: '800', textDecorationLine: 'underline' },
});
