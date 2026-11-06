import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSession } from '@clerk/expo';
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
import { usePrivateScreenCapture } from '../hooks/usePrivateScreenCapture';
import { usePrivateDataQuarantine } from '../hooks/usePrivateDataQuarantine';
import { candidateViewOwnerKey } from '../lib/candidateViewOwner';
import { focusedOwnedItem, verifiedFocusId } from '../lib/scopedNotificationRoute';
import { mayShowScoutError, shouldPublishScoutRead } from '../lib/scoutReadLease';
import { confirmScoutBlock, confirmScoutDecision, confirmScoutOptIn } from '../lib/scoutMutationReadback';
import { confirmScoutPreferences } from '../lib/scoutPreferencesReadback';
import { formatScoutDateTime, scoutJobLine, scoutResponseNote, scoutStatusLabel, validateScoutNumericInput } from '../lib/scoutWebParity';

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
  usePrivateScreenCapture('scouts');
  const { pinCandidateAction } = usePinnedCandidateAction();
  const { session } = useSession();
  const privateQuarantine = usePrivateDataQuarantine();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const privateAllowed = Boolean(ownerKey) && !privateQuarantine.shieldVisible && privateQuarantine.canAccessPrivateData();
  const verifiedOwnerRef = useRef<string | null>(null);
  const errorOwnerRef = useRef<string | null>(null);
  const currentOwnerRef = useRef(ownerKey);
  const writeSerialRef = useRef(0);
  const writePendingRef = useRef(false);
  const searchSerialRef = useRef(0);
  const searchPendingRef = useRef(false);
  const draftRevisionRef = useRef(0);
  // Invalidate a previous candidate's in-flight write completion on account switch.
  if (currentOwnerRef.current !== ownerKey) {
    currentOwnerRef.current = ownerKey;
    writeSerialRef.current += 1;
    writePendingRef.current = false;
    searchSerialRef.current += 1;
    searchPendingRef.current = false;
  }
  if (!privateAllowed) {
    verifiedOwnerRef.current = null;
    errorOwnerRef.current = null;
  }
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
  const { scoutId: rawScoutId } = useLocalSearchParams<{ scoutId?: string }>();
  const focusedScoutId = verifiedFocusId(rawScoutId);
  const focusedScout = focusedOwnedItem(scouts, focusedScoutId, (item) => item.scout_id);
  // On Native, put the exact authorized, notification-targeted card first instead of a Web anchor jump.
  const orderedScouts = focusedScout
    ? [focusedScout, ...scouts.filter((item) => item.scout_id !== focusedScoutId)]
    : scouts;

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
    verifiedOwnerRef.current = null;
    errorOwnerRef.current = null;
    setLoading(true);
    setError(null);
    setNotice(null);
    setScouts([]);
    setPrivacy(null);
    setBlockResults([]);
    setBlockQuery('');
    hydratePreferences(emptyJobseekerMatchingPreferences);
    setBusy(null);
    searchSerialRef.current += 1;
    searchPendingRef.current = false;
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const [nextScouts, nextPrivacy, nextPreferences] = await Promise.all([
        listJobseekerScouts(pinned.client),
        getScoutPrivacySettings(pinned.client),
        getJobseekerMatchingPreferences(pinned.client),
      ]);
      const verifiedOwner = candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId);
      if (!shouldPublishScoutRead({
        expectedOwnerKey: ownerKey,
        resolvedOwnerKey: verifiedOwner,
        requestGeneration: current,
        activeGeneration: generation.current,
        sessionCurrent: pinned.isCurrent(),
        privateAccess: privateQuarantine.canAccessPrivateData(),
      })) return;
      verifiedOwnerRef.current = verifiedOwner;
      errorOwnerRef.current = verifiedOwner;
      setScouts(nextScouts);
      setPrivacy(nextPrivacy);
      hydratePreferences(nextPreferences);
    } catch (loadError) {
      if (current === generation.current && privateQuarantine.canAccessPrivateData()) {
        errorOwnerRef.current = ownerKey;
        setError(String((loadError as { message?: unknown })?.message ?? loadError));
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [pinCandidateAction, ownerKey, privateAllowed]);

  useFocusEffect(useCallback(() => {
    if (!privateAllowed) {
      generation.current += 1;
      writeSerialRef.current += 1;
      writePendingRef.current = false;
      searchSerialRef.current += 1;
      searchPendingRef.current = false;
      verifiedOwnerRef.current = null;
      errorOwnerRef.current = null;
      return;
    }
    void load();
    return () => {
      generation.current += 1;
      writeSerialRef.current += 1;
      writePendingRef.current = false;
      searchSerialRef.current += 1;
      searchPendingRef.current = false;
      verifiedOwnerRef.current = null;
      errorOwnerRef.current = null;
    };
  }, [load, focusedScoutId, privateAllowed]));

  const pendingCount = scouts.filter((item) => item.scout_status === 'pending').length;

  const beginScoutWrite = (key: string): number | null => {
    if (!privateAllowed || verifiedOwnerRef.current !== ownerKey ||
        writePendingRef.current || searchPendingRef.current || busy !== null) return null;
    writePendingRef.current = true;
    const serial = ++writeSerialRef.current;
    setBusy(key);
    setError(null);
    setNotice(null);
    return serial;
  };

  const mayPublishScoutWrite = (
    pinned: NonNullable<Awaited<ReturnType<typeof pinCandidateAction>>>,
    serial: number,
    owner: string | null,
    readGeneration: number,
  ): boolean => serial === writeSerialRef.current
    && currentOwnerRef.current === owner
    && shouldPublishScoutRead({
      expectedOwnerKey: owner,
      resolvedOwnerKey: candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId),
      requestGeneration: readGeneration,
      activeGeneration: generation.current,
      sessionCurrent: pinned.isCurrent(),
      privateAccess: privateQuarantine.canAccessPrivateData(),
    });

  const requireScoutWriteOwner = (
    pinned: NonNullable<Awaited<ReturnType<typeof pinCandidateAction>>> | null,
    serial: number,
    owner: string | null,
    readGeneration: number,
  ): asserts pinned is NonNullable<Awaited<ReturnType<typeof pinCandidateAction>>> => {
    if (!pinned || !mayPublishScoutWrite(pinned, serial, owner, readGeneration)) {
      throw new Error('安全なログイン状態を確認できませんでした。');
    }
  };

  const failScoutWrite = (serial: number, owner: string | null, readGeneration: number) => {
    if (!owner || serial !== writeSerialRef.current ||
        currentOwnerRef.current !== owner || readGeneration !== generation.current ||
        !privateQuarantine.canAccessPrivateData()) return;
    // An interrupted RPC might already have changed the server. Never paint
    // an old status as pending or let the candidate unknowingly retry.
    verifiedOwnerRef.current = null;
    errorOwnerRef.current = owner;
    setScouts([]);
    setPrivacy(null);
    setError('操作結果を確認できませんでした。再読み込みして最新の状態をご確認ください。');
  };

  const finishScoutWrite = (serial: number) => {
    if (serial !== writeSerialRef.current) return;
    writePendingRef.current = false;
    setBusy(null);
  };

  const respond = (item: JobseekerScout, decision: 'accepted' | 'declined') => {
    if (!privateAllowed || writePendingRef.current || busy !== null ||
        item.scout_status !== 'pending') return;
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
            const serial = beginScoutWrite(item.scout_id);
            if (serial === null) return;
            const owner = ownerKey;
            const readGeneration = generation.current;
            try {
              const pinned = await pinCandidateAction();
              if (!pinned || !mayPublishScoutWrite(pinned, serial, owner, readGeneration)) {
                throw new Error('安全なログイン状態を確認できませんでした。');
              }
              const status = await respondToJobseekerScout(pinned.client, item.scout_id, decision);
              if (status !== decision) throw new Error('スカウト回答の結果が一致しません。');
              // Re-read with the SAME pinned candidate token. Never manufacture
              // responded_at or assume an RPC acknowledgement is the visible state.
              const canonical = confirmScoutDecision(
                await listJobseekerScouts(pinned.client), item.scout_id, decision);
              if (!mayPublishScoutWrite(pinned, serial, owner, readGeneration)) return;
              setScouts([...canonical]);
              setNotice(status === 'accepted'
                ? `${item.facility_name}からのスカウトを承諾しました。`
                : `${item.facility_name}からのスカウトを辞退しました。`);
            } catch {
              failScoutWrite(serial, owner, readGeneration);
            } finally {
              finishScoutWrite(serial);
            }
          })(),
        },
      ],
    );
  };

    const toggleScout = async (enabled: boolean) => {
    if (!privacy) return;
    const serial = beginScoutWrite('privacy');
    if (serial === null) return;
    const owner = ownerKey;
    const readGeneration = generation.current;
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || !mayPublishScoutWrite(pinned, serial, owner, readGeneration)) {
        throw new Error('安全なログイン状態を確認できませんでした。');
      }
      const response = await setScoutOptIn(pinned.client, enabled);
      if (response !== enabled) throw new Error('スカウト設定の保存結果が一致しません。');
      const confirmed = confirmScoutOptIn(await getScoutPrivacySettings(pinned.client), enabled);
      if (!mayPublishScoutWrite(pinned, serial, owner, readGeneration)) return;
      setPrivacy(confirmed);
      setNotice(enabled ? '匿名スカウトを受け取る設定にしました。' : '匿名スカウトを停止しました。');
    } catch {
      failScoutWrite(serial, owner, readGeneration);
    } finally {
      finishScoutWrite(serial);
    }
  };

  const searchBlocks = async () => {
    if (!privateAllowed || verifiedOwnerRef.current !== ownerKey ||
        writePendingRef.current || searchPendingRef.current || busy !== null) return;
    const requestedQuery = blockQuery.trim();
    if (requestedQuery.length < 2) {
      setBlockResults([]);
      setError('法人名を2文字以上入力してください。');
      return;
    }
    const serial = ++searchSerialRef.current;
    const writeSerial = writeSerialRef.current;
    const requestOwner = ownerKey;
    const readGeneration = generation.current;
    searchPendingRef.current = true;
    setBusy('block-search');
    setBlockResults([]);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || !mayPublishScoutWrite(pinned, writeSerial, requestOwner, readGeneration)) return;
      const rows = await searchScoutBlockableOrganizations(pinned.client, requestedQuery);
      if (serial !== searchSerialRef.current ||
          !mayPublishScoutWrite(pinned, writeSerial, requestOwner, readGeneration)) return;
      setBlockResults(rows);
    } catch {
      if (serial === searchSerialRef.current && readGeneration === generation.current &&
          requestOwner === currentOwnerRef.current && privateQuarantine.canAccessPrivateData()) {
        setError('法人の検索結果を確認できませんでした。もう一度検索してください。');
      }
    } finally {
      if (serial === searchSerialRef.current) {
        searchPendingRef.current = false;
        if (readGeneration === generation.current && requestOwner === currentOwnerRef.current) {
          setBusy(null);
        }
      }
    }
  };

  const changeBlockQuery = (value: string) => {
    searchSerialRef.current += 1;
    searchPendingRef.current = false;
    setBlockQuery(value);
    setBlockResults([]);
    if (busy === 'block-search') setBusy(null);
  };

  const addBlock = async (organization: ScoutBlockableOrganization) => {
    const serial = beginScoutWrite(organization.organization_id);
    if (serial === null) return;
    const owner = ownerKey;
    const readGeneration = generation.current;
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || !mayPublishScoutWrite(pinned, serial, owner, readGeneration)) {
        throw new Error('安全なログイン状態を確認できませんでした。');
      }
      await addScoutBlockedOrganization(pinned.client, organization.organization_id);
      const confirmed = confirmScoutBlock(
        await getScoutPrivacySettings(pinned.client), organization.organization_id, true);
      if (!mayPublishScoutWrite(pinned, serial, owner, readGeneration)) return;
      setPrivacy(confirmed);
      setBlockResults((current) => current.filter((item) => item.organization_id !== organization.organization_id));
      setNotice(`${organization.organization_name}からプロフィールが見えないようにしました。`);
    } catch {
      failScoutWrite(serial, owner, readGeneration);
    } finally {
      finishScoutWrite(serial);
    }
  };

    const removeBlock = async (organizationId: string) => {
    const serial = beginScoutWrite(organizationId);
    if (serial === null) return;
    const owner = ownerKey;
    const readGeneration = generation.current;
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || !mayPublishScoutWrite(pinned, serial, owner, readGeneration)) {
        throw new Error('安全なログイン状態を確認できませんでした。');
      }
      await removeScoutBlockedOrganization(pinned.client, organizationId);
      const confirmed = confirmScoutBlock(
        await getScoutPrivacySettings(pinned.client), organizationId, false);
      if (!mayPublishScoutWrite(pinned, serial, owner, readGeneration)) return;
      setPrivacy(confirmed);
      setNotice('手動ブロックを解除しました。');
    } catch {
      failScoutWrite(serial, owner, readGeneration);
    } finally {
      finishScoutWrite(serial);
    }
  };

  const savePreferences = async () => {
    if (!privateAllowed || verifiedOwnerRef.current !== ownerKey) return;
    const validated = validateScoutNumericInput({
      monthlySalaryText,
      hourlyWageText,
      commuteText,
      availableTimeFrom: preferences.available_time_from,
      availableTimeTo: preferences.available_time_to,
    });
    if (!validated.ok) {
      setError(validated.error);
      return;
    }
    const next: JobseekerMatchingPreferences = {
      ...preferences,
      desired_prefectures: parseList(prefecturesText),
      desired_cities: parseList(citiesText),
      ...validated.values,
    };
    const serial = beginScoutWrite('preferences');
    if (serial === null) return;
    const owner = ownerKey;
    const readGeneration = generation.current;
    const submittedRevision = draftRevisionRef.current;
    try {
      const pinned = await pinCandidateAction();
      if (!pinned || !mayPublishScoutWrite(pinned, serial, owner, readGeneration)) {
        throw new Error('安全なログイン状態を確認できませんでした。');
      }
      // An acknowledged write is not a verified persisted preference.
      await saveJobseekerMatchingPreferences(pinned.client, next);
      const verified = confirmScoutPreferences(
        next, await getJobseekerMatchingPreferences(pinned.client));
      if (!mayPublishScoutWrite(pinned, serial, owner, readGeneration)) return;
      if (draftRevisionRef.current === submittedRevision) {
        hydratePreferences(verified);
        setNotice('希望条件と保育観を保存しました。');
      } else {
        setNotice('保存開始時点の内容は確認できましたが、その後の編集は未保存です。');
      }
    } catch {
      failScoutWrite(serial, owner, readGeneration);
    } finally {
      finishScoutWrite(serial);
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
    draftRevisionRef.current += 1;
    setNotice(null);
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const editPreferenceText = (setter: (value: string) => void, value: string) => {
    draftRevisionRef.current += 1;
    setNotice(null);
    setter(value);
  };

  const verifiedVisible = privateAllowed && verifiedOwnerRef.current === ownerKey;
  const safeError = mayShowScoutError(ownerKey, errorOwnerRef.current, privateAllowed) ? error : null;
  if (loading || !verifiedVisible) {
    return (
      <View style={styles.center}>
        {safeError ? <Text style={styles.error}>{safeError}</Text> : <ActivityIndicator />}
        <Text style={styles.body}>スカウト設定を確認しています…</Text>
        {safeError ? <Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.bodyStrong}>もう一度読み込む</Text></Pressable> : null}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={styles.title}>スカウト</Text>
        <Text style={styles.bodyMuted}>園へ個人情報を出す前に、匿名でお誘いを受け取れます。</Text>
      </View>

      {safeError ? <Text style={styles.error}>{safeError}</Text> : null}
      {notice ? <Text style={styles.success}>{notice}</Text> : null}
      {focusedScoutId && !loading && !focusedScout ? (
        <Text style={styles.error}>指定されたスカウトは現在のアカウントで確認できません。</Text>
      ) : null}

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
        ) : orderedScouts.map((item) => (
          <View key={item.scout_id} style={[styles.innerCard, item.scout_id === focusedScoutId && styles.targetCard]}>
            {item.scout_id === focusedScoutId ? <Text style={styles.targetLabel}>通知から開いたスカウト</Text> : null}
            <View style={styles.rowBetween}>
              <Text style={styles.status}>{scoutStatusLabel(item.scout_status)}</Text>
              <Text style={styles.meta}>{formatScoutDateTime(item.sent_at)}</Text>
            </View>
            <Text style={styles.itemTitle}>{item.facility_name}</Text>
            <Text style={styles.bodyMuted}>{item.organization_name}</Text>
            {(item.job_title || item.employment_type) ? <Text style={styles.body}>{scoutJobLine(item.job_title, item.employment_type)}</Text> : null}
            {item.invitation_message ? <Text style={styles.quote}>{item.invitation_message}</Text> : null}
            <View style={styles.responseTimes}>
              <Text style={styles.meta}>回答期限 {formatScoutDateTime(item.expires_at)}</Text>
              {item.responded_at ? <Text style={styles.meta}>回答 {formatScoutDateTime(item.responded_at)}</Text> : null}
            </View>
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
            {scoutResponseNote(item.scout_status) ? <Text style={styles.bodyMuted}>{scoutResponseNote(item.scout_status)}</Text> : null}
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
            onChangeText={changeBlockQuery}
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
        <Text style={styles.inputLabel}>希望都道府県</Text>
        <TextInput accessibilityLabel="希望都道府県" value={prefecturesText} onChangeText={(value) => editPreferenceText(setPrefecturesText, value)} placeholder="例：東京都、神奈川県" style={styles.input} />
        <Text style={styles.inputLabel}>希望市区町村</Text>
        <TextInput accessibilityLabel="希望市区町村" value={citiesText} onChangeText={(value) => editPreferenceText(setCitiesText, value)} placeholder="例：世田谷区、川崎市" style={styles.input} />
        <Text style={styles.inputLabel}>希望月給の下限</Text>
        <TextInput accessibilityLabel="希望月給の下限" value={monthlySalaryText} onChangeText={(value) => editPreferenceText(setMonthlySalaryText, value)} placeholder="例：250000" keyboardType="numeric" style={styles.input} />
        <Text style={styles.inputLabel}>希望時給の下限</Text>
        <TextInput accessibilityLabel="希望時給の下限" value={hourlyWageText} onChangeText={(value) => editPreferenceText(setHourlyWageText, value)} placeholder="例：1300" keyboardType="numeric" style={styles.input} />
        <Text style={styles.inputLabel}>通勤時間の上限（分）</Text>
        <TextInput accessibilityLabel="通勤時間の上限（分）" value={commuteText} onChangeText={(value) => editPreferenceText(setCommuteText, value)} placeholder="1〜300分" keyboardType="numeric" style={styles.input} />

        <Text style={styles.itemTitle}>勤務できる曜日</Text>
        <ToggleChips options={weekdays} selected={preferences.available_weekdays} onChange={(value) => update('available_weekdays', value)} />
        <View style={styles.actionRow}>
          <View style={styles.timeField}>
            <Text style={styles.inputLabel}>開始</Text>
            <TextInput accessibilityLabel="勤務可能時間の開始" value={preferences.available_time_from ?? ''} onChangeText={(value) => update('available_time_from', value || null)} placeholder="例：08:00" maxLength={5} style={styles.input} />
          </View>
          <View style={styles.timeField}>
            <Text style={styles.inputLabel}>終了</Text>
            <TextInput accessibilityLabel="勤務可能時間の終了" value={preferences.available_time_to ?? ''} onChangeText={(value) => update('available_time_to', value || null)} placeholder="例：18:00" maxLength={5} style={styles.input} />
          </View>
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
  targetCard: { borderColor: '#e8445a', borderWidth: 2, backgroundColor: '#fff8fa' },
  targetLabel: { color: '#b4233e', fontSize: 14, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionRow: { flexDirection: 'row', gap: 8 },
  responseTimes: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  timeField: { flex: 1, gap: 4 },
  inputLabel: { fontSize: 14, fontWeight: '800', color: '#3c424b' },
  status: { fontSize: 14, fontWeight: '800', backgroundColor: '#f2f4f7', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, overflow: 'hidden' },
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
