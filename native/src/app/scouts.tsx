import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import {
  addScoutBlockedOrganization,
  emptyJobseekerMatchingPreferences,
  getJobseekerMatchingPreferences,
  getScoutPrivacySettings,
  listJobseekerScouts,
  removeScoutBlockedOrganization,
  respondToJobseekerScout,
  saveJobseekerMatchingPreferences,
  searchScoutBlockableOrganizations,
  setScoutOptIn,
  type JobseekerMatchingPreferences,
  type JobseekerScout,
  type ScoutBlockableOrganization,
  type ScoutPrivacySettings,
} from '../lib/candidateParityApi';

const weekdays = ['月', '火', '水', '木', '金', '土', '日'];
const classroomOptions = ['0歳児', '1歳児', '2歳児', '3歳児', '4歳児', '5歳児', 'フリー', '異年齢保育', '障害児保育'];
const leadershipOptions = ['乳児リーダー', '幼児リーダー', '副主任', '主任', '園長', '施設長'];
const childAgeOptions = ['0歳児', '1歳児', '2歳児', '3歳児', '4歳児', '5歳児', '異年齢'];
const childcareValueOptions = ['子ども主体', '自由保育', '遊び中心', '外遊び重視', '一斉保育', '教育・学習', '異年齢保育', '少人数保育', '行事重視', '行事は最小限', 'チーム保育', '個別支援', 'インクルーシブ保育'];
const workPreferenceOptions = ['残業少なめ', '持ち帰りなし', '有休を取りやすい', '土曜勤務少なめ', '早番少なめ', '遅番少なめ', 'ICT活用', '研修充実', '子育てと両立', '配置に余裕', '見学して決めたい', '体験して決めたい'];

function listText(values: string[]) {
  return values.join('、');
}

function parseList(value: string) {
  return [...new Set(value.split(/[、,\n]/).map((item) => item.trim()).filter(Boolean))];
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP');
}

function scoutStatusLabel(status: JobseekerScout['scout_status']) {
  return ({
    pending: '回答待ち',
    accepted: '承諾済み',
    declined: '辞退済み',
    cancelled: '取消',
    expired: '期限切れ',
  } as const)[status];
}

function ToggleChips({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <View style={styles.chipGrid}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(active ? selected.filter((value) => value !== option) : [...selected, option])}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ScoutsScreen() {
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [scouts, setScouts] = useState<JobseekerScout[]>([]);
  const [privacy, setPrivacy] = useState<ScoutPrivacySettings | null>(null);
  const [preferences, setPreferences] = useState<JobseekerMatchingPreferences>(emptyJobseekerMatchingPreferences);
  const [prefecturesText, setPrefecturesText] = useState('');
  const [citiesText, setCitiesText] = useState('');
  const [monthlySalaryText, setMonthlySalaryText] = useState('');
  const [hourlyWageText, setHourlyWageText] = useState('');
  const [commuteText, setCommuteText] = useState('');
  const [blockQuery, setBlockQuery] = useState('');
  const [blockResults, setBlockResults] = useState<ScoutBlockableOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const hydratePreferences = (next: JobseekerMatchingPreferences) => {
    setPreferences(next);
    setPrefecturesText(listText(next.desired_prefectures));
    setCitiesText(listText(next.desired_cities));
    setMonthlySalaryText(next.desired_monthly_salary_min == null ? '' : String(next.desired_monthly_salary_min));
    setHourlyWageText(next.desired_hourly_wage_min == null ? '' : String(next.desired_hourly_wage_min));
    setCommuteText(next.max_commute_minutes == null ? '' : String(next.max_commute_minutes));
  };

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const [nextScouts, nextPrivacy, nextPreferences] = await Promise.all([
        listJobseekerScouts(pinned.client),
        getScoutPrivacySettings(pinned.client),
        getJobseekerMatchingPreferences(pinned.client),
      ]);
      if (!pinned.isCurrent() || current !== generation.current) return;
      setScouts(nextScouts);
      setPrivacy(nextPrivacy);
      hydratePreferences(nextPreferences);
    } catch (loadError) {
      if (current === generation.current) setError(String((loadError as { message?: unknown })?.message ?? loadError));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [pinCandidateAction]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const pendingCount = scouts.filter((item) => item.scout_status === 'pending').length;

  const respond = (item: JobseekerScout, decision: 'accepted' | 'declined') => {
    const accepting = decision === 'accepted';
    Alert.alert(
      accepting ? 'スカウトを承諾しますか？' : 'スカウトを辞退しますか？',
      accepting
        ? '承諾すると、この園へ氏名・連絡先が共有されます。'
        : '辞退した場合、氏名・連絡先は園へ共有されません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: accepting ? '承諾する' : '辞退する',
          style: accepting ? 'default' : 'destructive',
          onPress: () => void (async () => {
            setBusy(item.scout_id);
            setError(null);
            setNotice(null);
            try {
              const pinned = await pinCandidateAction();
              if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
              const status = await respondToJobseekerScout(pinned.client, item.scout_id, decision);
              if (!pinned.isCurrent()) return;
              setScouts((current) => current.map((row) => row.scout_id === item.scout_id
                ? { ...row, scout_status: status, responded_at: new Date().toISOString() }
                : row));
              setNotice(status === 'accepted' ? `${item.facility_name}からのスカウトを承諾しました。` : `${item.facility_name}からのスカウトを辞退しました。`);
            } catch (responseError) {
              setError(String((responseError as { message?: unknown })?.message ?? responseError));
            } finally {
              setBusy(null);
            }
          })(),
        },
      ],
    );
  };

  const toggleScout = async (enabled: boolean) => {
    if (!privacy) return;
    setBusy('privacy');
    setError(null);
    setNotice(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const confirmed = await setScoutOptIn(pinned.client, enabled);
      if (!pinned.isCurrent()) return;
      if (confirmed !== enabled) throw new Error('スカウト設定の保存結果を確認できませんでした。');
      setPrivacy({ ...privacy, scout_opt_in: enabled });
      setNotice(enabled ? '匿名スカウトを受け取る設定にしました。' : '匿名スカウトを停止しました。');
    } catch (privacyError) {
      setError(String((privacyError as { message?: unknown })?.message ?? privacyError));
    } finally {
      setBusy(null);
    }
  };

  const searchBlocks = async () => {
    if (blockQuery.trim().length < 2) {
      setError('法人名を2文字以上入力してください。');
      return;
    }
    setBusy('block-search');
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const rows = await searchScoutBlockableOrganizations(pinned.client, blockQuery);
      if (!pinned.isCurrent()) return;
      setBlockResults(rows);
    } catch (searchError) {
      setError(String((searchError as { message?: unknown })?.message ?? searchError));
    } finally {
      setBusy(null);
    }
  };

  const addBlock = async (organization: ScoutBlockableOrganization) => {
    setBusy(organization.organization_id);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      await addScoutBlockedOrganization(pinned.client, organization.organization_id);
      const next = await getScoutPrivacySettings(pinned.client);
      if (!pinned.isCurrent()) return;
      setPrivacy(next);
      setBlockResults((current) => current.filter((item) => item.organization_id !== organization.organization_id));
      setNotice(`${organization.organization_name}からプロフィールが見えないようにしました。`);
    } catch (blockError) {
      setError(String((blockError as { message?: unknown })?.message ?? blockError));
    } finally {
      setBusy(null);
    }
  };

  const removeBlock = async (organizationId: string) => {
    setBusy(organizationId);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      await removeScoutBlockedOrganization(pinned.client, organizationId);
      const next = await getScoutPrivacySettings(pinned.client);
      if (!pinned.isCurrent()) return;
      setPrivacy(next);
      setNotice('手動ブロックを解除しました。');
    } catch (blockError) {
      setError(String((blockError as { message?: unknown })?.message ?? blockError));
    } finally {
      setBusy(null);
    }
  };

  const savePreferences = async () => {
    const monthly = monthlySalaryText.trim() ? Number(monthlySalaryText) : null;
    const hourly = hourlyWageText.trim() ? Number(hourlyWageText) : null;
    const commute = commuteText.trim() ? Number(commuteText) : null;
    if ([monthly, hourly, commute].some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
      setError('給与・通勤時間は0以上の数字で入力してください。');
      return;
    }
    if (preferences.available_time_from && preferences.available_time_to && preferences.available_time_from >= preferences.available_time_to) {
      setError('勤務可能時間は、開始時刻を終了時刻より前にしてください。');
      return;
    }
    const next: JobseekerMatchingPreferences = {
      ...preferences,
      desired_prefectures: parseList(prefecturesText),
      desired_cities: parseList(citiesText),
      desired_monthly_salary_min: monthly,
      desired_hourly_wage_min: hourly,
      max_commute_minutes: commute,
    };
    setBusy('preferences');
    setError(null);
    setNotice(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const saved = await saveJobseekerMatchingPreferences(pinned.client, next);
      if (!pinned.isCurrent()) return;
      hydratePreferences(saved);
      setNotice('希望条件と保育観を保存しました。');
    } catch (saveError) {
      setError(String((saveError as { message?: unknown })?.message ?? saveError));
    } finally {
      setBusy(null);
    }
  };

  const completion = useMemo(() => {
    const checks = [
      parseList(prefecturesText).length > 0,
      monthlySalaryText.trim() !== '' || hourlyWageText.trim() !== '',
      preferences.available_weekdays.length > 0,
      preferences.classroom_experience.length > 0,
      preferences.childcare_values.length > 0,
      preferences.work_preferences.length > 0,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [hourlyWageText, monthlySalaryText, preferences, prefecturesText]);

  const update = <K extends keyof JobseekerMatchingPreferences>(key: K, value: JobseekerMatchingPreferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator /><Text style={styles.body}>スカウト設定を確認しています…</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={styles.title}>スカウト</Text>
        <Text style={styles.bodyMuted}>園へ個人情報を出す前に、匿名でお誘いを受け取れます。</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.success}>{notice}</Text> : null}

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>届いた匿名スカウト</Text>
          <Text style={styles.count}>回答待ち {pendingCount}件</Text>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.infoStrong}>本人情報の共有はあなたが決めます</Text>
          <Text style={styles.bodyMuted}>承諾するまで氏名・メール・電話番号は開示されません。</Text>
        </View>
        {scouts.length === 0 ? (
          <Text style={styles.bodyMuted}>スカウトはまだ届いていません。下の設定をONにすると、希望条件や保育観を見た園からお誘いが届くことがあります。</Text>
        ) : scouts.map((item) => (
          <View key={item.scout_id} style={styles.innerCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.status}>{scoutStatusLabel(item.scout_status)}</Text>
              <Text style={styles.meta}>{formatDateTime(item.sent_at)}</Text>
            </View>
            <Text style={styles.itemTitle}>{item.facility_name}</Text>
            <Text style={styles.bodyMuted}>{item.organization_name}</Text>
            {(item.job_title || item.employment_type) ? <Text style={styles.body}>{[item.job_title, item.employment_type].filter(Boolean).join(' ・ ')}</Text> : null}
            {item.invitation_message ? <Text style={styles.quote}>{item.invitation_message}</Text> : null}
            <Text style={styles.meta}>回答期限 {formatDateTime(item.expires_at)}</Text>
            {item.scout_status === 'pending' ? (
              <View style={styles.actionRow}>
                <Pressable style={styles.secondaryButton} disabled={Boolean(busy)} onPress={() => respond(item, 'declined')}>
                  <Text style={styles.secondaryText}>辞退する</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} disabled={Boolean(busy)} onPress={() => respond(item, 'accepted')}>
                  <Text style={styles.primaryText}>{busy === item.scout_id ? '処理中…' : '承諾する'}</Text>
                </Pressable>
              </View>
            ) : null}
            {item.scout_status === 'accepted' ? <Text style={styles.bodyMuted}>承諾済みです。園からの連絡をお待ちください。</Text> : null}
            {item.scout_status === 'declined' ? <Text style={styles.bodyMuted}>辞退済みです。本人情報は共有されません。</Text> : null}
          </View>
        ))}
      </View>

      {privacy ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>匿名スカウト・公開範囲</Text>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>匿名スカウトを受け取る</Text>
              <Text style={styles.bodyMuted}>ONにすると、ブロックしていない園・法人から匿名プロフィールをもとにお誘いを受けられます。</Text>
            </View>
            <Switch value={privacy.scout_opt_in} disabled={busy === 'privacy'} onValueChange={(value) => void toggleScout(value)} />
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoStrong}>本人情報は承認前に共有しません</Text>
            <Text style={styles.bodyMuted}>氏名・ふりがな・メール・電話番号・ログインID・自己紹介文を匿名プロフィールに含めません。現在の勤務先には自動で表示されません。</Text>
          </View>

          <Text style={styles.itemTitle}>勤務先・見られたくない法人</Text>
          {privacy.automatic_blocks.map((organization) => (
            <View key={`auto-${organization.organization_id}`} style={styles.blockRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bodyStrong}>{organization.organization_name}</Text>
                <Text style={styles.meta}>現在の勤務先として自動ブロック</Text>
              </View>
              <Text style={styles.meta}>解除不可</Text>
            </View>
          ))}
          {privacy.manual_blocks.map((organization) => (
            <View key={organization.organization_id} style={styles.blockRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bodyStrong}>{organization.organization_name}</Text>
                <Text style={styles.meta}>手動ブロック</Text>
              </View>
              <Pressable style={styles.smallButton} disabled={Boolean(busy)} onPress={() => void removeBlock(organization.organization_id)}>
                <Text style={styles.secondaryText}>解除</Text>
              </Pressable>
            </View>
          ))}
          <TextInput
            value={blockQuery}
            onChangeText={setBlockQuery}
            placeholder="法人名を2文字以上入力"
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={() => void searchBlocks()}
          />
          <Pressable style={styles.secondaryButtonWide} disabled={Boolean(busy)} onPress={() => void searchBlocks()}>
            <Text style={styles.secondaryText}>{busy === 'block-search' ? '検索中…' : 'ブロックする法人を検索'}</Text>
          </Pressable>
          {blockResults.map((organization) => (
            <View key={organization.organization_id} style={styles.blockRow}>
              <Text style={[styles.bodyStrong, { flex: 1 }]}>{organization.organization_name}</Text>
              <Pressable style={styles.smallButton} disabled={Boolean(busy)} onPress={() => void addBlock(organization)}>
                <Text style={styles.secondaryText}>ブロック</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>詳しい希望条件・保育観</Text>
          <Text style={styles.count}>入力度 {completion}%</Text>
        </View>
        <Text style={styles.bodyMuted}>求人の並び順、保育観マッチング、匿名スカウトの精度向上に使います。</Text>

        <Text style={styles.itemTitle}>希望エリア・給与</Text>
        <TextInput value={prefecturesText} onChangeText={setPrefecturesText} placeholder="希望都道府県 例：東京都、神奈川県" style={styles.input} />
        <TextInput value={citiesText} onChangeText={setCitiesText} placeholder="希望市区町村 例：世田谷区、川崎市" style={styles.input} />
        <TextInput value={monthlySalaryText} onChangeText={setMonthlySalaryText} placeholder="希望月給の下限" keyboardType="numeric" style={styles.input} />
        <TextInput value={hourlyWageText} onChangeText={setHourlyWageText} placeholder="希望時給の下限" keyboardType="numeric" style={styles.input} />
        <TextInput value={commuteText} onChangeText={setCommuteText} placeholder="通勤時間の上限（分）" keyboardType="numeric" style={styles.input} />

        <Text style={styles.itemTitle}>勤務できる曜日</Text>
        <ToggleChips options={weekdays} selected={preferences.available_weekdays} onChange={(value) => update('available_weekdays', value)} />
        <View style={styles.actionRow}>
          <TextInput value={preferences.available_time_from ?? ''} onChangeText={(value) => update('available_time_from', value || null)} placeholder="開始 例 08:00" style={[styles.input, { flex: 1 }]} />
          <TextInput value={preferences.available_time_to ?? ''} onChangeText={(value) => update('available_time_to', value || null)} placeholder="終了 例 18:00" style={[styles.input, { flex: 1 }]} />
        </View>

        <Text style={styles.itemTitle}>担当経験</Text>
        <ToggleChips options={classroomOptions} selected={preferences.classroom_experience} onChange={(value) => update('classroom_experience', value)} />
        <Text style={styles.itemTitle}>リーダー・管理職経験</Text>
        <ToggleChips options={leadershipOptions} selected={preferences.leadership_roles} onChange={(value) => update('leadership_roles', value)} />
        <Text style={styles.itemTitle}>希望する担当年齢</Text>
        <ToggleChips options={childAgeOptions} selected={preferences.preferred_child_ages} onChange={(value) => update('preferred_child_ages', value)} />
        <Text style={styles.itemTitle}>大切にしたい保育観</Text>
        <ToggleChips options={childcareValueOptions} selected={preferences.childcare_values} onChange={(value) => update('childcare_values', value)} />
        <Text style={styles.itemTitle}>働く環境で重視すること</Text>
        <ToggleChips options={workPreferenceOptions} selected={preferences.work_preferences} onChange={(value) => update('work_preferences', value)} />

        <Pressable style={styles.primaryButtonWide} disabled={Boolean(busy)} onPress={() => void savePreferences()}>
          <Text style={styles.primaryText}>{busy === 'preferences' ? '保存中…' : '詳しい希望条件を保存'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, backgroundColor: '#f7f8fa', flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 26, fontWeight: '900' },
  sectionTitle: { fontSize: 20, fontWeight: '900' },
  itemTitle: { fontSize: 16, fontWeight: '800' },
  body: { fontSize: 16, lineHeight: 23, color: '#252a31' },
  bodyStrong: { fontSize: 16, fontWeight: '800', color: '#252a31' },
  bodyMuted: { fontSize: 15, lineHeight: 22, color: '#606873' },
  meta: { fontSize: 14, lineHeight: 20, color: '#7a818b' },
  count: { fontSize: 14, fontWeight: '800', color: '#606873' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12 },
  innerCard: { borderWidth: 1, borderColor: '#e6e8ec', borderRadius: 14, padding: 14, gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionRow: { flexDirection: 'row', gap: 8 },
  status: { fontSize: 14, fontWeight: '800', backgroundColor: '#f2f4f7', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, overflow: 'hidden' },
  itemTitle: { fontSize: 16, fontWeight: '800' },
  quote: { fontSize: 16, lineHeight: 23, backgroundColor: '#f7f8fa', padding: 12, borderRadius: 10 },
  infoBox: { backgroundColor: '#f5f8ff', borderRadius: 12, padding: 12, gap: 4 },
  infoStrong: { fontSize: 16, fontWeight: '900' },
  blockRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#eef0f2', paddingVertical: 8 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 16, backgroundColor: '#fff' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#fff0f3', borderColor: '#e8445a' },
  chipText: { fontSize: 15, fontWeight: '700' },
  chipTextActive: { color: '#b4233e' },
  primaryButton: { flex: 1, minHeight: 50, borderRadius: 12, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryButtonWide: { minHeight: 52, borderRadius: 12, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  secondaryButton: { flex: 1, minHeight: 50, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryButtonWide: { minHeight: 50, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  smallButton: { minHeight: 48, minWidth: 72, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  secondaryText: { fontSize: 15, fontWeight: '800' },
  success: { fontSize: 15, color: '#067647', backgroundColor: '#ecfdf3', padding: 12, borderRadius: 10 },
  error: { fontSize: 15, color: '#b42318', backgroundColor: '#fff1f0', padding: 12, borderRadius: 10 },
});
