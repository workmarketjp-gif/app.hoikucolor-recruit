import { useSession, useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { DocumentVaultSection } from '../../components/DocumentVaultSection';
import { useAccountDeletion } from '../../contexts/AccountDeletionContext';
import { useAppLock } from '../../contexts/AppLockContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { usePinnedCandidateAction } from '../../hooks/usePinnedCandidateAction';
import {
  getJobseekerProfile,
  upsertJobseekerProfile,
  type JobseekerProfileInput,
} from '../../lib/jobseekerCoreApi';
import { usePrivateScreenCapture } from '../../hooks/usePrivateScreenCapture';
import { usePrivateDataQuarantine } from '../../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey } from '../../lib/candidateViewOwner';
import { canPresentProfileResult, canonicalProfileMatchesSubmission } from '../../lib/profileSaveGuard';
import { canAttemptProfileSave, profileWriteFailureNeedsReload, profileReloadNeedsDiscardConfirmation } from '../../lib/profileWriteRecovery';
import { profileWebValidationError } from '../../lib/profileWebValidation';
import { profilePrefectureChoices } from '../../lib/profilePrefectureOptions';
import { ProfileStartDatePicker } from '../../components/ProfileStartDatePicker';

const positionOptions = ['保育士', '保育教諭', '幼稚園教諭', '保育補助', '看護師', '栄養士', '調理師', '児童指導員', '子育て支援員'];
const employmentOptions = ['正社員', '契約社員', 'パート・アルバイト', '派遣'];
const qualificationOptions = ['保育士', '幼稚園教諭', '保育教諭', '看護師', '准看護師', '栄養士', '管理栄養士', '調理師', '子育て支援員'];

const emptyProfile: JobseekerProfileInput = {
  email: null,
  name: null,
  name_kana: null,
  phone: null,
  prefecture: null,
  desired_positions: [],
  desired_employment_types: [],
  qualifications: [],
  years_of_experience: null,
  desired_start_date: null,
  self_intro: null,
};

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function Field({ label, value, onChangeText, ...props }: { label: string; value: string; onChangeText: (value: string) => void; [key: string]: any }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} accessibilityLabel={label} style={styles.input} {...props} />
    </View>
  );
}


function PrefectureSelectField({ value, disabled, onChange }: {
  value: string | null;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // A lock or a different candidate must not reopen a former private picker.
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>お住まいの都道府県</Text>
      <Pressable testID="profile-prefecture-select" accessibilityRole="button"
        accessibilityLabel="お住まいの都道府県"
        accessibilityHint="47都道府県から選択できます"
        accessibilityState={{ disabled, expanded: open && !disabled }}
        disabled={disabled} style={styles.prefectureTrigger} onPress={() => setOpen(true)}>
        <Text style={[styles.prefectureValue, !value && styles.prefecturePlaceholder]}>
          {value || '選択してください'}
        </Text>
        <Text style={styles.prefectureChevron}>▼</Text>
      </Pressable>
      <Modal transparent animationType="slide" visible={open && !disabled}
        onRequestClose={() => setOpen(false)}>
        <View style={styles.prefectureModalLayer}>
          <Pressable style={styles.prefectureBackdrop} accessibilityLabel="選択を閉じる"
            accessibilityRole="button" onPress={() => setOpen(false)} />
          <View style={styles.prefectureModalPanel}>
            <Text style={styles.prefectureModalTitle}>お住まいの都道府県</Text>
            <ScrollView style={styles.prefectureOptions} keyboardShouldPersistTaps="handled">
              {['', ...profilePrefectureChoices(value)].map((option) => (
                <Pressable key={option || 'unspecified'} accessibilityRole="button"
                  accessibilityLabel={option || '選択しない'}
                  accessibilityState={{ selected: option === (value ?? '') }}
                  style={styles.prefectureOption} onPress={() => {
                    onChange(option || null);
                    setOpen(false);
                  }}>
                  <Text style={styles.prefectureOptionText}>{option || '選択しない'}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable accessibilityRole="button" style={styles.prefectureClose}
              onPress={() => setOpen(false)}>
              <Text style={styles.prefectureCloseText}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ChipGroup({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const all = [...new Set([...options, ...values])];
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipGrid}>
        {all.map((option) => {
          const active = values.includes(option);
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(active ? values.filter((value) => value !== option) : [...values, option])}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  usePrivateScreenCapture('profile');
  const { user } = useUser();
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const ownerKeyRef = useRef(ownerKey);
  ownerKeyRef.current = ownerKey;
  const router = useRouter();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const appLock = useAppLock();
  const notifications = useNotifications();
  const deletion = useAccountDeletion();
  const [profile, setProfile] = useState<JobseekerProfileInput>(emptyProfile);
  const [loadedOwnerKey, setLoadedOwnerKey] = useState<string | null>(null);
  const [experienceText, setExperienceText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsCanonicalReload, setNeedsCanonicalReload] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const generation = useRef(0);
  const draftRevision = useRef(0);
  const savingRef = useRef(false);
  const savingOwnerRef = useRef<string | null>(null);
  const savingGenerationRef = useRef<number | null>(null);

  const isLive = (requestOwnerKey: string | null, requestGeneration: number) =>
    canPresentProfileResult(requestOwnerKey, ownerKeyRef.current, requestGeneration,
      generation.current, privacy.canAccessPrivateData());
  const canEditDraft = () => Boolean(ownerKeyRef.current && loadedOwnerKey === ownerKeyRef.current &&
    !privacy.shieldVisible && privacy.canAccessPrivateData());
  const editProfile = (updater: (current: JobseekerProfileInput) => JobseekerProfileInput) => {
    if (!canEditDraft()) return;
    draftRevision.current += 1;
    setHasUnsavedChanges(true);
    setMessage(null);
    setProfile(updater);
  };
  const editExperience = (value: string) => {
    if (!canEditDraft()) return;
    draftRevision.current += 1;
    setHasUnsavedChanges(true);
    setMessage(null);
    setExperienceText(value);
  };

  const hydrate = (next: JobseekerProfileInput) => {
    setProfile(next);
    setExperienceText(next.years_of_experience == null ? '' : String(next.years_of_experience));
  };


  const load = useCallback(async () => {
    const requestOwner = ownerKey;
    const requestGeneration = ++generation.current;
    // A prior candidate's draft must never survive a session change or App Lock.
    setLoadedOwnerKey(null);
    setProfile(emptyProfile);
    setExperienceText('');
    setMessage(null);
    setError(null);
    setHasUnsavedChanges(false);
    setLoading(true);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() ||
          candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== requestOwner) {
        throw new Error('安全なログイン状態を確認できませんでした。');
      }
      const current = await getJobseekerProfile(pinned.client);
      if (!pinned.isCurrent() || !isLive(requestOwner, requestGeneration)) return;
      if (current && current.clerk_user_id !== pinned.ownerId) {
        throw new Error('プロフィールの閲覧権限を確認できませんでした。');
      }
      const primaryEmail = user?.primaryEmailAddress?.emailAddress ?? null;
      hydrate(current ?? { ...emptyProfile, email: primaryEmail });
      draftRevision.current += 1;
      setNeedsCanonicalReload(false);
      setLoadedOwnerKey(requestOwner);
    } catch {
      if (isLive(requestOwner, requestGeneration)) {
        setError('プロフィールを取得できませんでした。再読み込みしてください。');
      }
    } finally {
      if (isLive(requestOwner, requestGeneration)) setLoading(false);
    }
  }, [ownerKey, pinCandidateAction, user?.primaryEmailAddress?.emailAddress, privacy.canAccessPrivateData]);

  useEffect(() => {
    if (!ownerKey || privacy.shieldVisible) {
      generation.current += 1;
      savingRef.current = false;
      savingOwnerRef.current = null;
      savingGenerationRef.current = null;
      setNeedsCanonicalReload(false);
      setHasUnsavedChanges(false);
      setLoadedOwnerKey(null);
      setProfile(emptyProfile);
      setExperienceText('');
      setMessage(null);
      setError(null);
      setSaving(false);
      setLoading(true);
      return;
    }
    // The same mounted tab may survive Clerk account/session replacement.
    // An old owner's late finally must not keep the new owner's Save disabled.
    if (savingOwnerRef.current && savingOwnerRef.current !== ownerKey) {
      savingRef.current = false;
      savingOwnerRef.current = null;
      savingGenerationRef.current = null;
      setSaving(false);
    }
    void load();
    return () => { generation.current += 1; };
  }, [ownerKey, privacy.shieldVisible, load]);

  const save = async () => {
    if (!ownerKey || !canAttemptProfileSave({
      ownerKey, loadedOwnerKey,
      privateAllowed: !privacy.shieldVisible && privacy.canAccessPrivateData(),
      loading, saving: savingRef.current || saving, needsCanonicalReload,
    })) return;
    const requestOwner = ownerKey;
    const requestGeneration = generation.current;
    const submittedRevision = draftRevision.current;
    let writeAttempted = false;
    savingRef.current = true;
    savingOwnerRef.current = requestOwner;
    savingGenerationRef.current = requestGeneration;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const years = experienceText.trim() === '' ? null : Number(experienceText);
      if (years != null && (!Number.isFinite(years) || years < 0 || years > 80)) {
        throw new Error('経験年数は0〜80の数字で入力してください。');
      }
      const next: JobseekerProfileInput = {
        ...profile,
        email: nullable(profile.email ?? ''),
        name: nullable(profile.name ?? ''),
        name_kana: nullable(profile.name_kana ?? ''),
        phone: nullable(profile.phone ?? ''),
        prefecture: nullable(profile.prefecture ?? ''),
        desired_positions: profile.desired_positions,
        desired_employment_types: profile.desired_employment_types,
        qualifications: profile.qualifications,
        years_of_experience: years,
        desired_start_date: nullable(profile.desired_start_date ?? ''),
        self_intro: nullable(profile.self_intro ?? ''),
      };
      const invalid = profileWebValidationError(next.name, next.desired_start_date);
      if (invalid) throw new Error(invalid);
      const pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() ||
          candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== requestOwner ||
          !isLive(requestOwner, requestGeneration)) {
        throw new Error('安全なログイン状態を確認できませんでした。');
      }
      // An interrupted upsert or its follow-up read may have committed. Never
      // allow the candidate to resend a potentially stale draft automatically.
      writeAttempted = true;
      await upsertJobseekerProfile(pinned.client, next);
      if (!pinned.isCurrent() || !isLive(requestOwner, requestGeneration)) return;
      const reread = await getJobseekerProfile(pinned.client);
      if (!pinned.isCurrent() || !isLive(requestOwner, requestGeneration)) return;
      if (!reread || reread.clerk_user_id !== pinned.ownerId ||
          !canonicalProfileMatchesSubmission(next, reread)) {
        throw new Error('保存したプロフィールの再取得が一致しませんでした。');
      }
      if (submittedRevision !== draftRevision.current) {
        // Keep the edits made while the network write was pending.
        setMessage('保存開始時点の内容は確認できましたが、その後の編集は未保存です。');
      } else {
        hydrate(reread);
        setHasUnsavedChanges(false);
        setMessage('プロフィールを保存しました。');
      }
    } catch (saveError) {
      if (isLive(requestOwner, requestGeneration)) {
        if (profileWriteFailureNeedsReload(writeAttempted)) {
          setNeedsCanonicalReload(true);
          setError('プロフィールの保存結果が確認できません。再送信せず、最新の内容を読み込んで確認してください。');
        } else {
          setError(String((saveError as { message?: unknown })?.message ?? saveError));
        }
      }
    } finally {
      // A prior owner/lock epoch must not release a newer owner's save lease.
      if (savingOwnerRef.current === requestOwner &&
          savingGenerationRef.current === requestGeneration) {
        savingRef.current = false;
        savingOwnerRef.current = null;
        savingGenerationRef.current = null;
        // A new canonical refresh can revoke this generation while the same
        // owner remains mounted. Do not strand its Save button in busy state.
        if (ownerKeyRef.current === requestOwner) setSaving(false);
      }
    }
  };

  const reloadLatest = () => {
    if (savingRef.current) return;
    const expectedOwner = ownerKey;
    const expectedGeneration = generation.current;
    const proceed = () => {
      if (!expectedOwner || ownerKeyRef.current !== expectedOwner ||
          generation.current !== expectedGeneration ||
          !privacy.canAccessPrivateData() || savingRef.current) return;
      void load();
    };
    if (!profileReloadNeedsDiscardConfirmation(hasUnsavedChanges)) {
      proceed();
      return;
    }
    Alert.alert('未保存の変更を破棄しますか？',
      '最新のプロフィールを読み込むと、この画面で未保存の入力は失われます。', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '破棄して再読み込み', style: 'destructive', onPress: proceed },
      ]);
  };

  const confirmDeletion = () => {
    Alert.alert(
      'Hoiku Colorを退会しますか？',
      '応募・メッセージ・保存求人・書類などHoiku Colorの求職者データを削除対象にします。処理開始前は取り消せます。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '退会を申し込む',
          style: 'destructive',
          onPress: () => void deletion.requestDeletion().catch(() => undefined),
        },
      ],
    );
  };

  const privateViewReady = Boolean(ownerKey) && !privacy.shieldVisible && privacy.canAccessPrivateData();
  if (!privateViewReady || loading || loadedOwnerKey !== ownerKey) {
    return <View style={styles.center}>
      {privateViewReady && !loading && error ? <>
        <Text style={styles.error}>{error}</Text>
        <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => void load()}>
          <Text style={styles.secondaryButtonText}>再読み込み</Text>
        </Pressable>
      </> : <><ActivityIndicator /><Text>プロフィールを確認しています…</Text></>}
    </View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.menuCard}>
        <Text style={styles.sectionTitle}>お仕事探しメニュー</Text>
        <Pressable style={styles.menuButton} accessibilityRole="button" onPress={() => router.push('/(tabs)/applications')}><Text style={styles.menuText}>応募管理</Text><Text style={styles.menuChevron}>›</Text></Pressable>
        <Pressable style={styles.menuButton} accessibilityRole="button" onPress={() => router.push('/messages' as never)}><Text style={styles.menuText}>メッセージ</Text><Text style={styles.menuChevron}>›</Text></Pressable>
        <Pressable style={styles.menuButton} accessibilityRole="button" onPress={() => router.push('/resume' as never)}><Text style={styles.menuText}>履歴書・職務経歴書を作成・編集</Text><Text style={styles.menuChevron}>›</Text></Pressable>
        <Pressable style={styles.menuButton} onPress={() => router.push('/scouts' as never)}><Text style={styles.menuText}>スカウト</Text><Text style={styles.menuChevron}>›</Text></Pressable>
        <Pressable style={styles.menuButton} onPress={() => router.push('/visits' as never)}><Text style={styles.menuText}>見学・体験の予約</Text><Text style={styles.menuChevron}>›</Text></Pressable>
        <Pressable style={styles.menuButton} onPress={() => router.push('/spot-jobs' as never)}><Text style={styles.menuText}>スポット勤務</Text><Text style={styles.menuChevron}>›</Text></Pressable>
        <Pressable style={styles.menuButton} onPress={() => router.push('/matches' as never)}><Text style={styles.menuText}>マッチ度を見る</Text><Text style={styles.menuChevron}>›</Text></Pressable>
        <Pressable style={styles.menuButton} onPress={() => router.push('/compare' as never)}><Text style={styles.menuText}>園を比較する</Text><Text style={styles.menuChevron}>›</Text></Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>基本プロフィール</Text>
        <Field label="お名前（必須）" value={profile.name ?? ''} onChangeText={(value) => editProfile((current) => ({ ...current, name: value }))} placeholder="例：保育 花子" />
        <Field label="ふりがな" value={profile.name_kana ?? ''} onChangeText={(value) => editProfile((current) => ({ ...current, name_kana: value }))} placeholder="例：ほいく はなこ" />
        <Field label="メール" value={profile.email ?? ''} onChangeText={(value) => editProfile((current) => ({ ...current, email: value }))} keyboardType="email-address" autoCapitalize="none" />
        <Field label="電話番号" value={profile.phone ?? ''} onChangeText={(value) => editProfile((current) => ({ ...current, phone: value }))} keyboardType="phone-pad" />
        <PrefectureSelectField value={profile.prefecture} disabled={!canEditDraft()}
          onChange={(value) => editProfile((current) => ({ ...current, prefecture: value }))} />
        <ChipGroup label="希望職種" options={positionOptions} values={profile.desired_positions} onChange={(values) => editProfile((current) => ({ ...current, desired_positions: values }))} />
        <ChipGroup label="希望雇用形態" options={employmentOptions} values={profile.desired_employment_types} onChange={(values) => editProfile((current) => ({ ...current, desired_employment_types: values }))} />
        <ChipGroup label="資格" options={qualificationOptions} values={profile.qualifications} onChange={(values) => editProfile((current) => ({ ...current, qualifications: values }))} />
        <Field label="保育経験年数" value={experienceText} onChangeText={editExperience} keyboardType="numeric" placeholder="例：5" />
        <ProfileStartDatePicker value={profile.desired_start_date} disabled={!canEditDraft()}
          onChange={(value) => editProfile((current) => ({ ...current, desired_start_date: value }))} />
        <Field label="自己紹介" value={profile.self_intro ?? ''} onChangeText={(value) => editProfile((current) => ({ ...current, self_intro: value }))} multiline placeholder="経験や大切にしている保育観など" />
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.primaryButton} disabled={saving || loading || needsCanonicalReload} onPress={() => void save()}>
          {saving ? <ActivityIndicator /> : <Text style={styles.primaryButtonText}>プロフィールを保存</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.secondaryButton} disabled={saving}
          onPress={reloadLatest}>
          <Text style={styles.secondaryButtonText}>{needsCanonicalReload ? '保存結果を再取得する' : '最新の内容を読み込む'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <DocumentVaultSection qualifications={profile.qualifications} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>端末の安全設定</Text>
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>Face ID・指紋でロック</Text>
            <Text style={styles.subtle}>バックグラウンド復帰時に求人・応募情報を保護します。</Text>
          </View>
          <Switch value={appLock.enabled} disabled={!appLock.capability.canEnable || appLock.loading} onValueChange={(value) => void appLock.setEnabled(value)} />
        </View>
        {appLock.lastError ? <Text style={styles.error}>{appLock.lastError}</Text> : null}
        {appLock.enabled ? (
          <Pressable style={styles.secondaryButton} onPress={appLock.lockNow}><Text style={styles.secondaryButtonText}>今すぐロック</Text></Pressable>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>通知</Text>
        <Text style={styles.subtle}>園からの連絡、見学・面接日程、選考更新を受け取ります。</Text>
        {notifications.pushState?.kind === 'registered' ? (
          <Text style={styles.success}>この端末の通知は有効です。</Text>
        ) : notifications.pushState?.kind === 'permission_denied' ? (
          <Pressable style={styles.secondaryButton} onPress={() => void notifications.openPushSettings()}><Text style={styles.secondaryButtonText}>端末の通知設定を開く</Text></Pressable>
        ) : (
          <Pressable style={styles.secondaryButton} onPress={() => void notifications.enablePush()}><Text style={styles.secondaryButtonText}>通知を有効にする</Text></Pressable>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>アカウント</Text>
        <Pressable style={styles.secondaryButton} disabled={deletion.busy} onPress={() => void deletion.signOutSafely()}>
          <Text style={styles.secondaryButtonText}>ログアウト</Text>
        </Pressable>
        <Pressable style={styles.dangerButton} disabled={deletion.busy} onPress={confirmDeletion}>
          <Text style={styles.dangerButtonText}>Hoiku Colorを退会</Text>
        </Pressable>
        {deletion.lastError ? <Text style={styles.error}>{deletion.lastError}</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, backgroundColor: '#f7f8fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, gap: 12 },
  menuCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 2 },
  menuButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eef0f2', paddingHorizontal: 4 },
  menuText: { flex: 1, fontSize: 16, fontWeight: '800' },
  menuChevron: { fontSize: 24, color: '#8a909b' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive: { borderColor: '#e8445a', backgroundColor: '#fff0f3' },
  chipText: { fontSize: 15, fontWeight: '700' },
  chipTextActive: { color: '#b4233e' },
  sectionTitle: { fontSize: 19, fontWeight: '800' },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '700', color: '#47505b' },
  input: { borderWidth: 1, borderColor: '#d7dce2', borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, fontSize: 16, minHeight: 46 },
  primaryButton: { minHeight: 48, backgroundColor: '#191c20', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryButtonText: { fontWeight: '800' },
  dangerButton: { minHeight: 46, borderWidth: 1, borderColor: '#e6a4a0', borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  dangerButtonText: { color: '#b42318', fontWeight: '800' },
  subtle: { color: '#606873', lineHeight: 20 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingTitle: { fontWeight: '800' },
  success: { color: '#067647', backgroundColor: '#ecfdf3', padding: 10, borderRadius: 9 },
  error: { color: '#b42318', backgroundColor: '#fff1f0', padding: 10, borderRadius: 9 },
  prefectureTrigger: { minHeight: 48, borderWidth: 1, borderColor: '#d7dce2', backgroundColor: '#fff', borderRadius: 11, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  prefectureValue: { flex: 1, fontSize: 16, color: '#30212B', fontWeight: '600' },
  prefecturePlaceholder: { color: '#77717B' },
  prefectureChevron: { color: '#A9204B', fontSize: 13, marginLeft: 12 },
  prefectureModalLayer: { flex: 1, justifyContent: 'flex-end' },
  prefectureBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0008' },
  prefectureModalPanel: { maxHeight: '75%', padding: 20, paddingBottom: 32, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 },
  prefectureModalTitle: { fontSize: 19, fontWeight: '900', color: '#30212B' },
  prefectureOptions: { flexGrow: 0 },
  prefectureOption: { minHeight: 48, justifyContent: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F5EBEF' },
  prefectureOptionText: { fontSize: 16, fontWeight: '700', color: '#30212B' },
  prefectureClose: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9265A', borderRadius: 12 },
  prefectureCloseText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
