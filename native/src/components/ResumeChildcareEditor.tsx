import { useSession } from '@clerk/expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { usePrivateDataQuarantine } from '../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey } from '../lib/candidateViewOwner';
import { getJobseekerProfile, upsertJobseekerProfile, type JobseekerProfileInput } from '../lib/jobseekerCoreApi';
import {
  emptyJobseekerMatchingPreferences, getJobseekerMatchingPreferences,
  saveJobseekerMatchingPreferences, type JobseekerMatchingPreferences,
} from '../lib/candidateParityApi';
import { canonicalProfileMatchesSubmission } from '../lib/profileSaveGuard';
import { canonicalScoutPreferencesMatch } from '../lib/scoutPreferencesReadback';
import {
  RESUME_CLASSROOM_OPTIONS, RESUME_LEADERSHIP_OPTIONS, RESUME_LINKED_AUTOSAVE_DELAY_MS,
  parseResumeExperienceYears, toggleResumeExperienceChoice, canAutosaveResumeLinkedData,
} from '../lib/resumeChildcarePolicy';

const emptyProfile: JobseekerProfileInput = {
  email: null, name: null, name_kana: null, phone: null, prefecture: null,
  desired_positions: [], desired_employment_types: [], qualifications: [],
  years_of_experience: null, desired_start_date: null, self_intro: null,
};

type Target = 'profile' | 'preferences';

/** Web /resume step 5 edits the existing candidate profile and matching preferences. */
export function ResumeChildcareEditor({ visible }: { visible: boolean }) {
  const { session } = useSession();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const privacy = usePrivateDataQuarantine();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const privateAllowed = Boolean(ownerKey) && !privacy.shieldVisible && privacy.canAccessPrivateData();
  const ownerRef = useRef(ownerKey);
  ownerRef.current = ownerKey;
  const generation = useRef(0);
  const profileRevision = useRef(0);
  const preferenceRevision = useRef(0);
  const profileInFlight = useRef(false);
  const preferenceInFlight = useRef(false);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const [profile, setProfile] = useState<JobseekerProfileInput | null>(null);
  const [preferences, setPreferences] = useState<JobseekerMatchingPreferences | null>(null);
  const [yearsText, setYearsText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirtyProfile, setDirtyProfile] = useState(false);
  const [dirtyPreferences, setDirtyPreferences] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [pausedProfile, setPausedProfile] = useState(false);
  const [pausedPreferences, setPausedPreferences] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isLive = (expectedOwner: string, request: number) =>
    generation.current === request && ownerRef.current === expectedOwner && privacy.canAccessPrivateData();

  const clearPrivateView = () => {
    setLoadedOwner(null);
    setProfile(null);
    setPreferences(null);
    setYearsText('');
    setValidationError(null);
    setDirtyProfile(false);
    setDirtyPreferences(false);
    setSavingProfile(false);
    setSavingPreferences(false);
    setPausedProfile(false);
    setPausedPreferences(false);
    setNotice(null);
    setError(null);
    setLoading(true);
  };

  const load = useCallback(async () => {
    const request = ++generation.current;
    const expectedOwner = ownerKey;
    clearPrivateView();
    if (!expectedOwner || !privacy.canAccessPrivateData()) return;
    try {
      const pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== expectedOwner) return;
      const [canonicalProfile, canonicalPreferences] = await Promise.all([
        getJobseekerProfile(pinned.client), getJobseekerMatchingPreferences(pinned.client),
      ]);
      if (!pinned.isCurrent() || !isLive(expectedOwner, request)) return;
      if (canonicalProfile && canonicalProfile.clerk_user_id !== pinned.ownerId) {
        throw new Error('プロフィールの閲覧権限を確認できませんでした。');
      }
      const nextProfile = canonicalProfile ?? { ...emptyProfile, email: session?.user?.primaryEmailAddress?.emailAddress ?? null };
      setProfile(nextProfile);
      setPreferences(canonicalPreferences ?? { ...emptyJobseekerMatchingPreferences });
      setYearsText(nextProfile.years_of_experience === null ? '' : String(nextProfile.years_of_experience));
      setLoadedOwner(expectedOwner);
      profileRevision.current += 1;
      preferenceRevision.current += 1;
    } catch {
      if (isLive(expectedOwner, request)) setError('保育経験と希望条件を読み込めませんでした。再読み込みしてください。');
    } finally {
      if (isLive(expectedOwner, request)) setLoading(false);
    }
  }, [ownerKey, pinCandidateAction, privacy.canAccessPrivateData, session?.user?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    if (!privateAllowed) {
      generation.current += 1;
      clearPrivateView();
      return;
    }
    void load();
    return () => { generation.current += 1; };
  }, [privateAllowed, load]);

  const editProfile = (update: (current: JobseekerProfileInput) => JobseekerProfileInput) => {
    if (!privateAllowed || ownerKey !== loadedOwner || !privacy.canAccessPrivateData()) return;
    profileRevision.current += 1;
    setDirtyProfile(true);
    setPausedProfile(false);
    setError(null);
    setNotice(null);
    setProfile((current) => current ? update(current) : null);
  };
  const editPreferences = (update: (current: JobseekerMatchingPreferences) => JobseekerMatchingPreferences) => {
    if (!privateAllowed || ownerKey !== loadedOwner || !privacy.canAccessPrivateData()) return;
    preferenceRevision.current += 1;
    setDirtyPreferences(true);
    setPausedPreferences(false);
    setError(null);
    setNotice(null);
    setPreferences((current) => current ? update(current) : null);
  };

  const save = async (target: Target) => {
    const isProfile = target === 'profile';
    const draft = isProfile ? profile : preferences;
    const dirty = isProfile ? dirtyProfile : dirtyPreferences;
    const paused = isProfile ? pausedProfile : pausedPreferences;
    const inFlight = isProfile ? profileInFlight : preferenceInFlight;
    if (!draft || !dirty || paused || inFlight.current || !privateAllowed || ownerKey !== loadedOwner || !ownerKey) return;
    inFlight.current = true;
    if (isProfile) setSavingProfile(true); else setSavingPreferences(true);
    const expectedOwner = ownerKey;
    const startedGeneration = generation.current;
    const submittedRevision = isProfile ? profileRevision.current : preferenceRevision.current;
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== expectedOwner || !isLive(expectedOwner, startedGeneration)) {
        throw new Error('ログイン状態を確認できませんでした。最新の内容を読み込み直してください。');
      }
      if (isProfile) {
        const submitted = draft as JobseekerProfileInput;
        await upsertJobseekerProfile(pinned.client, submitted);
        if (!pinned.isCurrent() || !isLive(expectedOwner, startedGeneration)) return;
        const verified = await getJobseekerProfile(pinned.client);
        if (!pinned.isCurrent() || !isLive(expectedOwner, startedGeneration)) return;
        if (!verified || verified.clerk_user_id !== pinned.ownerId ||
            !canonicalProfileMatchesSubmission(submitted, verified)) {
          throw new Error('プロフィールの保存結果を確認できませんでした。');
        }
        if (submittedRevision === profileRevision.current) {
          setProfile(verified);
          setDirtyProfile(false);
          setNotice('保育経験を正式データで確認しました。');
        }
      } else {
        const submitted = draft as JobseekerMatchingPreferences;
        await saveJobseekerMatchingPreferences(pinned.client, submitted);
        if (!pinned.isCurrent() || !isLive(expectedOwner, startedGeneration)) return;
        const verified = await getJobseekerMatchingPreferences(pinned.client);
        if (!pinned.isCurrent() || !isLive(expectedOwner, startedGeneration)) return;
        if (!canonicalScoutPreferencesMatch(submitted, verified)) {
          throw new Error('担当経験・役職の保存結果を確認できませんでした。');
        }
        if (submittedRevision === preferenceRevision.current) {
          setPreferences(verified);
          setDirtyPreferences(false);
          setNotice('担当経験・役職を正式データで確認しました。');
        }
      }
    } catch {
      if (isLive(expectedOwner, startedGeneration)) {
        // An RPC may already have committed even when its response/readback failed.
        // Stop automatic retry for THIS dataset until a canonical reload.
        if (isProfile) setPausedProfile(true); else setPausedPreferences(true);
        setError('保存結果を確認できませんでした。再送信せず最新のデータを読み込み直してください。');
      }
    } finally {
      inFlight.current = false;
      if (isLive(expectedOwner, startedGeneration)) {
        if (isProfile) setSavingProfile(false); else setSavingPreferences(false);
      }
    }
  };

  useEffect(() => {
    if (!canAutosaveResumeLinkedData({ ownerKey, loadedOwner, privateAllowed, dirty: dirtyProfile,
      saving: savingProfile, paused: pausedProfile }) || !profile || validationError) return;
    const timer = setTimeout(() => { void save('profile'); }, RESUME_LINKED_AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ownerKey, loadedOwner, privateAllowed, dirtyProfile, savingProfile, pausedProfile, profile, validationError]);

  useEffect(() => {
    if (!canAutosaveResumeLinkedData({ ownerKey, loadedOwner, privateAllowed, dirty: dirtyPreferences,
      saving: savingPreferences, paused: pausedPreferences }) || !preferences) return;
    const timer = setTimeout(() => { void save('preferences'); }, RESUME_LINKED_AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ownerKey, loadedOwner, privateAllowed, dirtyPreferences, savingPreferences, pausedPreferences, preferences]);

  const reload = () => {
    if (!privateAllowed) return;
    if (!dirtyProfile && !dirtyPreferences) { void load(); return; }
    const expectedOwner = ownerKey;
    const request = generation.current;
    Alert.alert('未保存の変更を破棄しますか？', '正式データを読み込むと未保存の保育経験・希望条件は失われます。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '破棄して再読み込み', style: 'destructive', onPress: () => {
        if (ownerRef.current !== expectedOwner || generation.current !== request || !privacy.canAccessPrivateData()) return;
        void load();
      } },
    ]);
  };

  // Always mounted by the parent while the résumé wizard is active. Section
  // changes therefore cannot silently cancel a pending 1.2-second save.
  if (!visible || !privateAllowed) return null;
  if (loading || loadedOwner !== ownerKey || !profile || !preferences) {
    return <View style={styles.panel}>
      {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color="#E9265A" />}
      <Pressable accessibilityRole="button" style={styles.action} onPress={reload}><Text style={styles.actionText}>再読み込み</Text></Pressable>
    </View>;
  }
  const selectedExperience = profile.years_of_experience;
  return <View style={styles.panel}>
    <Text style={styles.note}>ここで編集した内容はマイページの正式なプロフィールと「詳しい希望条件」にも保存され、職務経歴書の保育経験に使われます。</Text>
    <View style={styles.field}>
      <Text style={styles.label}>保育の経験は何年ですか？</Text>
      <Text style={styles.note}>0〜80年、0.5年単位。未経験の場合は空欄でも構いません。</Text>
      <TextInput accessibilityLabel="保育経験年数" keyboardType="decimal-pad" style={styles.input}
        value={yearsText} onChangeText={(value) => {
          setYearsText(value);
          try {
            const parsed = parseResumeExperienceYears(value);
            setValidationError(null);
            if (parsed !== selectedExperience) editProfile((current) => ({ ...current, years_of_experience: parsed }));
          } catch (cause) {
            setValidationError(cause instanceof Error ? cause.message : '経験年数を確認してください。');
          }
        }} />
      {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
    </View>
    <Text style={styles.label}>担当したことがある年齢・クラス</Text>
    <View style={styles.choices}>{[...new Set([...RESUME_CLASSROOM_OPTIONS, ...preferences.classroom_experience])].map((name) => {
      const selected = preferences.classroom_experience.includes(name);
      return <Pressable key={name} accessibilityRole="button" accessibilityState={{ selected }}
        style={[styles.choice, selected && styles.selected]} onPress={() => editPreferences((current) => ({
          ...current, classroom_experience: toggleResumeExperienceChoice(current.classroom_experience, name),
        }))}><Text style={[styles.choiceText, selected && styles.selectedText]}>{name}</Text></Pressable>;
    })}</View>
    <Text style={styles.label}>リーダー・管理職の経験</Text>
    <View style={styles.choices}>{[...new Set([...RESUME_LEADERSHIP_OPTIONS, ...preferences.leadership_roles])].map((name) => {
      const selected = preferences.leadership_roles.includes(name);
      return <Pressable key={name} accessibilityRole="button" accessibilityState={{ selected }}
        style={[styles.choice, selected && styles.selected]} onPress={() => editPreferences((current) => ({
          ...current, leadership_roles: toggleResumeExperienceChoice(current.leadership_roles, name),
        }))}><Text style={[styles.choiceText, selected && styles.selectedText]}>{name}</Text></Pressable>;
    })}</View>
    {notice ? <Text style={styles.success}>{notice}</Text> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {(dirtyProfile || dirtyPreferences) ? <Text style={styles.note}>
      {pausedProfile || pausedPreferences ? '保存結果が不明です。自動再送信は停止しています。' :
        savingProfile || savingPreferences ? '保育経験・希望条件を保存しています…' : '変更を約1.2秒後に自動保存します。'}
    </Text> : null}
    {(pausedProfile || pausedPreferences || error) ? <Pressable accessibilityRole="button" style={styles.action} onPress={reload}>
      <Text style={styles.actionText}>最新データを読み込む</Text>
    </Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: 12, paddingTop: 6 },
  field: { gap: 7 },
  label: { color: '#34232E', fontSize: 15, fontWeight: '800' },
  note: { color: '#6A5E67', fontSize: 14, lineHeight: 21 },
  input: { borderWidth: 1, borderColor: '#D8C9D0', borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 12, minHeight: 48, fontSize: 16, color: '#281D25' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 44, borderWidth: 1, borderColor: '#E5D1D9', borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' },
  selected: { backgroundColor: '#FFF0F4', borderColor: '#E9265A' },
  choiceText: { color: '#453741', fontSize: 14, fontWeight: '700' },
  selectedText: { color: '#B82051' },
  action: { minHeight: 44, borderWidth: 1, borderColor: '#D8C9D0', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#34232E', fontSize: 15, fontWeight: '800' },
  error: { color: '#A12636', fontSize: 14, lineHeight: 21 },
  success: { color: '#087044', fontSize: 14, fontWeight: '700' },
});
