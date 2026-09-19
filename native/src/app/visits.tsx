import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import {
  cancelVisit,
  getVisitSettings,
  listCandidateVisits,
  requestVisitDurable,
  type JobseekerVisitHistory,
  type JobseekerVisitSettings,
  type VisitExperienceType,
} from '../lib/applicationJourneyApi';

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
  const params = useLocalSearchParams<{ visitId?: string | string[]; jobId?: string | string[]; applicationId?: string | string[] }>();
  const router = useRouter();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const focusedVisitId = firstParam(params.visitId) ?? null;
  const jobId = firstParam(params.jobId) ?? null;
  const applicationId = firstParam(params.applicationId) ?? null;
  const [visits, setVisits] = useState<JobseekerVisitHistory[]>([]);
  const [settings, setSettings] = useState<JobseekerVisitSettings | null>(null);
  const [experienceType, setExperienceType] = useState<VisitExperienceType>('visit');
  const [localDate, setLocalDate] = useState('');
  const [localTime, setLocalTime] = useState('');
  const [candidateMessage, setCandidateMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (quiet = false) => {
    const current = ++generation.current;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const [nextVisits, nextSettings] = await Promise.all([
        listCandidateVisits(pinned.client),
        jobId ? getVisitSettings(pinned.client, jobId) : Promise.resolve(null),
      ]);
      if (!pinned.isCurrent() || current !== generation.current) return;
      setVisits(nextVisits);
      setSettings(nextSettings);
      const available = allowedTypes(nextSettings);
      if (available.length && !available.includes(experienceType)) setExperienceType(available[0]);
    } catch (loadError) {
      if (current === generation.current) setError(String((loadError as { message?: unknown })?.message ?? loadError));
    } finally {
      if (current === generation.current && !quiet) setLoading(false);
    }
  }, [experienceType, jobId, pinCandidateAction]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const requestVisit = async () => {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
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
      setCandidateMessage('');
      await load(true);
      router.replace(`/visits?visitId=${encodeURIComponent(reservationId)}&jobId=${encodeURIComponent(jobId)}${applicationId ? `&applicationId=${encodeURIComponent(applicationId)}` : ''}` as never);
    } catch (requestError) {
      setError(String((requestError as { message?: unknown })?.message ?? requestError));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (reservationId: string) => {
    setBusy(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      await cancelVisit(pinned.client, reservationId);
      if (!pinned.isCurrent()) return;
      await load(true);
    } catch (cancelError) {
      setError(String((cancelError as { message?: unknown })?.message ?? cancelError));
    } finally {
      setBusy(false);
    }
  };

  const visibleVisits = useMemo(() => {
    if (!focusedVisitId) return visits;
    return [...visits].sort((a, b) => Number(b.reservation_id === focusedVisitId) - Number(a.reservation_id === focusedVisitId));
  }, [focusedVisitId, visits]);
  const availableTypes = allowedTypes(settings);

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={styles.title}>見学・体験</Text>
        <Text style={styles.subtle}>園見学・半日体験・1日体験の予約と結果を確認できます。</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && visits.length === 0 ? <ActivityIndicator /> : null}

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
              <Pressable style={styles.primary} disabled={busy || !localDate || !localTime} onPress={() => void requestVisit()}>
                <Text style={styles.primaryText}>{busy ? '予約を確認中…' : '見学・体験を申し込む'}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>予約履歴</Text>
        {!loading && visibleVisits.length === 0 ? <Text style={styles.subtle}>予約履歴はありません。</Text> : null}
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
                <Pressable style={styles.secondary} disabled={busy} onPress={() => void cancel(visit.reservation_id)}>
                  <Text style={styles.secondaryText}>予約をキャンセル</Text>
                </Pressable>
              ) : null}
              {visit.application_id ? (
                <Pressable style={styles.linkButton} onPress={() => router.push(`/application/${visit.application_id}` as never)}>
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
