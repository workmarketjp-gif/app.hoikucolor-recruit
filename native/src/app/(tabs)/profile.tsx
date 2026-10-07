import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
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
      <TextInput value={value} onChangeText={onChangeText} style={styles.input} {...props} />
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
  const { user } = useUser();
  const router = useRouter();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const appLock = useAppLock();
  const notifications = useNotifications();
  const deletion = useAccountDeletion();
  const [profile, setProfile] = useState<JobseekerProfileInput>(emptyProfile);
  const [experienceText, setExperienceText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const hydrate = (next: JobseekerProfileInput) => {
    setProfile(next);
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
        desired_positions: profile.desired_positions,
        desired_employment_types: profile.desired_employment_types,
        qualifications: profile.qualifications,
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
      <View style={styles.menuCard}>
        <Text style={styles.sectionTitle}>お仕事探しメニュー</Text>
        <Pressable style={styles.menuButton} onPress={() => router.push('/scouts' as never)}><Text style={styles.menuText}>スカウト</Text><Text style={styles.menuChevron}>›</Text></Pressable>
        <Pressable style={styles.menuButton} onPress={() => router.push('/visits' as never)}><Text style={styles.menuText}>見学・体験の予約</Text><Text style={styles.menuChevron}>›</Text></Pressable>
        <Pressable style={styles.menuButton} onPress={() => router.push('/spot-jobs' as never)}><Text style={styles.menuText}>スポット勤務</Text><Text style={styles.menuChevron}>›</Text></Pressable>
        <Pressable style={styles.menuButton} onPress={() => router.push('/matches' as never)}><Text style={styles.menuText}>マッチ度を見る</Text><Text style={styles.menuChevron}>›</Text></Pressable>
        <Pressable style={styles.menuButton} onPress={() => router.push('/compare' as never)}><Text style={styles.menuText}>園を比較する</Text><Text style={styles.menuChevron}>›</Text></Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>基本プロフィール</Text>
        <Field label="氏名" value={profile.name ?? ''} onChangeText={(value) => setProfile((current) => ({ ...current, name: value }))} placeholder="例：保育 花子" />
        <Field label="ふりがな" value={profile.name_kana ?? ''} onChangeText={(value) => setProfile((current) => ({ ...current, name_kana: value }))} placeholder="例：ほいく はなこ" />
        <Field label="メール" value={profile.email ?? ''} onChangeText={(value) => setProfile((current) => ({ ...current, email: value }))} keyboardType="email-address" autoCapitalize="none" />
        <Field label="電話番号" value={profile.phone ?? ''} onChangeText={(value) => setProfile((current) => ({ ...current, phone: value }))} keyboardType="phone-pad" />
        <Field label="希望都道府県" value={profile.prefecture ?? ''} onChangeText={(value) => setProfile((current) => ({ ...current, prefecture: value }))} placeholder="例：東京都" />
        <ChipGroup label="希望職種" options={positionOptions} values={profile.desired_positions} onChange={(values) => setProfile((current) => ({ ...current, desired_positions: values }))} />
        <ChipGroup label="希望雇用形態" options={employmentOptions} values={profile.desired_employment_types} onChange={(values) => setProfile((current) => ({ ...current, desired_employment_types: values }))} />
        <ChipGroup label="資格" options={qualificationOptions} values={profile.qualifications} onChange={(values) => setProfile((current) => ({ ...current, qualifications: values }))} />
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
});
