import { useUser } from '@clerk/expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
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

function listText(values: string[]) {
  return values.join('、');
}

function parseList(value: string) {
  return [...new Set(value.split(/[、,\n]/).map((part) => part.trim()).filter(Boolean))];
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function Field({ label, value, onChangeText, ...props }: { label: string; value: string; onChangeText: (value: string) => void; [key: string]: any }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} style={styles.input} {...props} />
    </View>
  );
}

export default function ProfileScreen() {
  const { user } = useUser();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const appLock = useAppLock();
  const notifications = useNotifications();
  const deletion = useAccountDeletion();
  const [profile, setProfile] = useState<JobseekerProfileInput>(emptyProfile);
  const [desiredPositionsText, setDesiredPositionsText] = useState('');
  const [desiredEmploymentText, setDesiredEmploymentText] = useState('');
  const [qualificationsText, setQualificationsText] = useState('');
  const [experienceText, setExperienceText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const hydrate = (next: JobseekerProfileInput) => {
    setProfile(next);
    setDesiredPositionsText(listText(next.desired_positions));
    setDesiredEmploymentText(listText(next.desired_employment_types));
    setQualificationsText(listText(next.qualifications));
    setExperienceText(next.years_of_experience == null ? '' : String(next.years_of_experience));
  };

  const load = useCallback(async () => {
    const currentGeneration = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const current = await getJobseekerProfile(pinned.client);
      if (!pinned.isCurrent() || currentGeneration !== generation.current) return;
      const primaryEmail = user?.primaryEmailAddress?.emailAddress ?? null;
      hydrate(current ?? { ...emptyProfile, email: primaryEmail });
    } catch (loadError) {
      if (currentGeneration === generation.current) setError(String((loadError as { message?: unknown })?.message ?? loadError));
    } finally {
      if (currentGeneration === generation.current) setLoading(false);
    }
  }, [pinCandidateAction, user?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const save = async () => {
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
        desired_positions: parseList(desiredPositionsText),
        desired_employment_types: parseList(desiredEmploymentText),
        qualifications: parseList(qualificationsText),
        years_of_experience: years,
        desired_start_date: nullable(profile.desired_start_date ?? ''),
        self_intro: nullable(profile.self_intro ?? ''),
      };
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const saved = await upsertJobseekerProfile(pinned.client, next);
      if (!pinned.isCurrent()) return;
      hydrate(saved);
      setMessage('プロフィールを保存しました。');
    } catch (saveError) {
      setError(String((saveError as { message?: unknown })?.message ?? saveError));
    } finally {
      setSaving(false);
    }
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

  if (loading) {
    return <View style={styles.center}><ActivityIndicator /><Text>プロフィールを確認しています…</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>基本プロフィール</Text>
        <Field label="氏名" value={profile.name ?? ''} onChangeText={(value) => setProfile((current) => ({ ...current, name: value }))} placeholder="例：保育 花子" />
        <Field label="ふりがな" value={profile.name_kana ?? ''} onChangeText={(value) => setProfile((current) => ({ ...current, name_kana: value }))} placeholder="例：ほいく はなこ" />
        <Field label="メール" value={profile.email ?? ''} onChangeText={(value) => setProfile((current) => ({ ...current, email: value }))} keyboardType="email-address" autoCapitalize="none" />
        <Field label="電話番号" value={profile.phone ?? ''} onChangeText={(value) => setProfile((current) => ({ ...current, phone: value }))} keyboardType="phone-pad" />
        <Field label="希望都道府県" value={profile.prefecture ?? ''} onChangeText={(value) => setProfile((current) => ({ ...current, prefecture: value }))} placeholder="例：東京都" />
        <Field label="希望職種（、区切り）" value={desiredPositionsText} onChangeText={setDesiredPositionsText} placeholder="保育士、主任" />
        <Field label="希望雇用形態（、区切り）" value={desiredEmploymentText} onChangeText={setDesiredEmploymentText} placeholder="正社員、パート" />
        <Field label="資格（、区切り）" value={qualificationsText} onChangeText={setQualificationsText} placeholder="保育士、幼稚園教諭" />
        <Field label="保育経験年数" value={experienceText} onChangeText={setExperienceText} keyboardType="numeric" placeholder="例：5" />
        <Field label="希望入職日" value={profile.desired_start_date ?? ''} onChangeText={(value) => setProfile((current) => ({ ...current, desired_start_date: value }))} placeholder="YYYY-MM-DD" />
        <Field label="自己紹介" value={profile.self_intro ?? ''} onChangeText={(value) => setProfile((current) => ({ ...current, self_intro: value }))} multiline placeholder="経験や大切にしている保育観など" />
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.primaryButton} disabled={saving} onPress={() => void save()}>
          {saving ? <ActivityIndicator /> : <Text style={styles.primaryButtonText}>プロフィールを保存</Text>}
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>応募書類</Text>
        <Text style={styles.subtle}>履歴書・職務経歴書・資格証を登録し、応募時に使う書類を管理します。</Text>
        <DocumentVaultSection />
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
  sectionTitle: { fontSize: 19, fontWeight: '800' },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: '#47505b' },
  input: { borderWidth: 1, borderColor: '#d7dce2', borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, fontSize: 16, minHeight: 46 },
  primaryButton: { minHeight: 48, backgroundColor: '#191c20', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryButtonText: { fontWeight: '800' },
  dangerButton: { minHeight: 46, borderWidth: 1, borderColor: '#e6a4a0', borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  dangerButtonText: { color: '#b42318', fontWeight: '800' },
  subtle: { color: '#606873', lineHeight: 20 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingTitle: { fontWeight: '800' },
  success: { color: '#067647', backgroundColor: '#ecfdf3', padding: 10, borderRadius: 9 },
  error: { color: '#b42318', backgroundColor: '#fff1f0', padding: 10, borderRadius: 9 },
});
