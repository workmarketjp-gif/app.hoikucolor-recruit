import { useSession } from '@clerk/expo';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { usePrivateDataQuarantine } from '../hooks/usePrivateDataQuarantine';
import { usePrivateScreenCapture } from '../hooks/usePrivateScreenCapture';
import { ResumeYearMonthField } from '../components/ResumeYearMonthField';
import { ResumeChildcareEditor } from '../components/ResumeChildcareEditor';
import { ResumeReviewPanel } from '../components/ResumeReviewPanel';
import { buildResumeReview, type ResumeReview } from '../lib/resumeReviewModel';
import { canPresentResumePhoto, prepareResumePhotoPreview, type ResumePhotoPreview } from '../lib/resumePhotoPreview';
import { isPrivateDocumentPickerCacheUri } from '../lib/documentPickerCache';
import { getJobseekerProfile } from '../lib/jobseekerCoreApi';
import { getJobseekerMatchingPreferences, emptyJobseekerMatchingPreferences } from '../lib/candidateParityApi';
import { candidateViewOwnerKey } from '../lib/candidateViewOwner';
import {
  getCandidateResume, saveCandidateResumeAndConfirm, toResumePayload, ResumeReadbackUnconfirmed, ResumeRevisionConflict, type CandidateResume,
  type ResumeEducation, type ResumeEmployment,
} from '../lib/resumeCanonical';
import { MAX_RESUME_EDUCATION, MAX_RESUME_EMPLOYMENT, canAppendResumeEntry, educationStatusChange, moveResumeEntry, resumeCurrentChange } from '../lib/resumeEditor';
import { RESUME_AUTOSAVE_DELAY_MS, shouldConfirmResumeReload, shouldScheduleResumeAutosave } from '../lib/resumeAutosavePolicy';

const sections = ['基本情報', '学歴', '職歴', '資格', '保育経験', '自己PR', '確認・保存'] as const;
const sectionQuestions = ['あなたのことを教えてください', 'どの学校を卒業しましたか？', 'これまで、どこで働きましたか？', 'どんな資格・免許を持っていますか？', '保育の経験を教えてください', 'あなたの強みや思いを書きましょう', '入力内容を確認して保存しましょう'] as const;
const statuses = ['卒業', '卒業見込み', '修了', '中退', '在学中'];
const ageGroups = ['0歳児', '1歳児', '2歳児', '3歳児', '4歳児', '5歳児', '異年齢', 'フリー'];
const facilityTypeOptions = ['認可保育園', '認定こども園', '幼稚園', '小規模保育', '企業主導型保育', '事業所内保育', '認可外保育施設', '学童保育', '児童発達支援', '保育以外'];
const employmentTypeOptions = ['正社員', '契約社員', 'パート・アルバイト', '派遣'];
const leavingReasonOptions = ['一身上の都合により退職', '契約期間満了により退職', '会社都合により退職', '退職'];
const nullable = (v: string) => v.trim() || null;
type FieldProps = { label: string; value: string | null; onChange: (value: string | null) => void; multiline?: boolean; hint?: string };
function Field({ label, value, onChange, multiline, hint }: FieldProps) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    <TextInput accessibilityLabel={label} value={value ?? ''} onChangeText={(v) => onChange(nullable(v))}
      multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'}
      style={[styles.input, multiline && styles.textArea]} />
  </View>;
}
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }}
    style={[styles.choice, selected && styles.selected]} onPress={onPress}>
    <Text style={[styles.choiceLabel, selected && styles.selectedLabel]}>{label}</Text>
  </Pressable>;
}

/** Native expandable select with the Web's existing options and unknown saved-value preservation. */
function ResumeOptionField({ label, value, choices, onChange }: {
  label: string; value: string | null; choices: readonly string[]; onChange: (value: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const values = value && !choices.includes(value) ? [value, ...choices] : choices;
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={label + 'を選択'}
      onPress={() => setExpanded((was) => !was)} style={styles.optionTrigger}>
      <Text style={styles.choiceLabel}>{value || '選択してください（任意）'}</Text>
      <Text style={styles.selectedLabel}>{expanded ? '閉じる' : '選ぶ'}</Text>
    </Pressable>
    {expanded ? <View style={styles.choices}>
      <Choice label="未設定" selected={!value} onPress={() => { onChange(null); setExpanded(false); }} />
      {values.map((item) => <Choice key={item} label={item} selected={value === item}
        onPress={() => { onChange(item); setExpanded(false); }} />)}
    </View> : null}
  </View>;
}

/** Editable candidate-owned Web /resume parity slice, not a PDF generator. */
export default function ResumeScreen() {
  usePrivateScreenCapture('resume');
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const router = useRouter();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const canRead = !privacy.shieldVisible && privacy.canAccessPrivateData();
  const ownerRef = useRef(ownerKey);
  ownerRef.current = ownerKey;
  const generation = useRef(0);
  const draftRevision = useRef(0);
  const savingRef = useRef(false);
  const [resume, setResume] = useState<CandidateResume | null>(null);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const [section, setSection] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [autoSavePaused, setAutoSavePaused] = useState(false);
  const [requiresReload, setRequiresReload] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ owner: string; data: ResumeReview } | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewRefresh, setReviewRefresh] = useState(0);
  const reviewRequest = useRef(0);
  const photoInFlight = useRef(false);
  const photoScreenActive = useRef(false);
  const [photoPreview, setPhotoPreview] = useState<ResumePhotoPreview | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const live = (owner: string, request: number) =>
    request === generation.current && ownerRef.current === owner && privacy.canAccessPrivateData();
  const edit = (update: (value: CandidateResume) => CandidateResume) => {
    if (!canRead || loadedOwner !== ownerKey || ownerRef.current !== ownerKey || !privacy.canAccessPrivateData()) return;
    draftRevision.current += 1;
    setStatus(null);
    setError(null);
    // A known validation error may be fixed by editing; an ambiguous commit or
    // revision conflict must first be reconciled with the canonical record.
    if (!requiresReload) setAutoSavePaused(false);
    setDirty(true);
    setResume((value) => value ? update(value) : null);
  };
  const change = <K extends keyof CandidateResume>(key: K, value: CandidateResume[K]) =>
    edit((current) => ({ ...current, [key]: value }));

  const load = useCallback(async () => {
    const request = ++generation.current;
    const expectedOwner = ownerKey;
    setResume(null);
    setLoadedOwner(null);
    setDirty(false);
    setSaving(false);
    setAutoSavePaused(false);
    setRequiresReload(false);
    setStatus(null);
    setError(null);
    setLoading(true);
    if (!expectedOwner || !privacy.canAccessPrivateData()) return;
    try {
      const pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== expectedOwner) return;
      const canonical = await getCandidateResume(pinned.client);
      if (!pinned.isCurrent() || !live(expectedOwner, request)) return;
      setResume(canonical);
      setLoadedOwner(expectedOwner);
      draftRevision.current += 1;
    } catch {
      if (live(expectedOwner, request)) setError('履歴書を取得できませんでした。再読み込みしてください。');
    } finally {
      if (live(expectedOwner, request)) setLoading(false);
    }
  }, [ownerKey, pinCandidateAction, privacy.canAccessPrivateData]);

  useFocusEffect(useCallback(() => {
    photoScreenActive.current = true;
    if (!ownerKey || privacy.shieldVisible || !privacy.canAccessPrivateData()) {
      photoScreenActive.current = false;
      generation.current += 1;
      setLoadedOwner(null);
      setResume(null);
      setDirty(false);
      setLoading(true);
      setPhotoPreview(null);
      setPhotoError(null);
      setPhotoBusy(false);
      return;
    }
    void load();
    return () => {
      photoScreenActive.current = false;
      generation.current += 1;
      setLoadedOwner(null);
      setResume(null);
      setPhotoPreview(null);
      setPhotoError(null);
      setPhotoBusy(false);
    };
  }, [ownerKey, privacy.shieldVisible, privacy.canAccessPrivateData, load]));

  // Never retain a previous owner's photo across a lock, reload or account change.
  useEffect(() => {
    if (!canRead || loadedOwner !== ownerKey) {
      setPhotoPreview(null);
      setPhotoError(null);
    }
  }, [canRead, loadedOwner, ownerKey]);

  const pickResumePhoto = async () => {
    if (photoInFlight.current || section !== 6 || !canRead || !ownerKey ||
        loadedOwner !== ownerKey || !photoScreenActive.current) return;
    const startedOwner = ownerKey;
    const startedGeneration = generation.current;
    const stillEligible = () => canPresentResumePhoto({
      startedOwner, currentOwner: ownerRef.current, loadedOwner,
      startedGeneration, currentGeneration: generation.current,
      privateAllowed: !privacy.shieldVisible && privacy.canAccessPrivateData(),
      screenActive: photoScreenActive.current,
    });
    photoInFlight.current = true;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      // Expo's native editor may crop differently on iOS. A consistent 3:4
      // sanitized export must be verified before the photo can enter a PDF.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4],
        quality: 0.88, base64: true, exif: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) throw new Error('写真を確認できませんでした。もう一度選んでください。');
      let prepared: ResumePhotoPreview | null = null;
      let failure: unknown = null;
      try {
        prepared = prepareResumePhotoPreview(asset);
      } catch (cause) {
        failure = cause;
      }
      // ImagePicker creates an app-cache copy. Delete it before retaining the
      // selected image in JS memory. Never delete an external library original.
      try {
        if (!isPrivateDocumentPickerCacheUri(asset.uri)) {
          throw new Error('写真の一時ファイルを安全に確認できませんでした。');
        }
        const temp = new File(asset.uri);
        if (temp.exists) temp.delete();
        if (temp.exists) throw new Error('写真の一時ファイルを削除できませんでした。');
      } catch (cause) {
        failure = cause;
      }
      if (!stillEligible()) return;
      if (failure) throw failure;
      if (!prepared) throw new Error('写真を確認できませんでした。');
      setPhotoPreview(prepared);
    } catch (cause) {
      if (stillEligible()) {
        setPhotoError(cause instanceof Error ? cause.message : '写真を読み込めませんでした。');
      }
    } finally {
      photoInFlight.current = false;
      if (stillEligible()) setPhotoBusy(false);
    }
  };

  const save = async () => {
    if (savingRef.current || autoSavePaused || !resume || !dirty || !canRead || loadedOwner !== ownerKey || !ownerKey) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const submitted = resume;
    const submittedRevision = draftRevision.current;
    const startedGeneration = generation.current;
    const expectedOwner = ownerKey;
    try {
      const pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== expectedOwner || !live(expectedOwner, startedGeneration)) {
        // A credential/pin failure in the still-visible owner scope is not a
        // reason to retry every 1.2 seconds. Hide stale progress and reload.
        if (live(expectedOwner, startedGeneration)) {
          setAutoSavePaused(true);
          setRequiresReload(true);
          setError('ログイン状態を確認できませんでした。再送信せず、最新の内容を読み込んでください。');
        }
        return;
      }
      const confirmed = await saveCandidateResumeAndConfirm(pinned.client, submitted);
      if (!pinned.isCurrent() || !live(expectedOwner, startedGeneration)) return;
      if (submittedRevision === draftRevision.current) {
        setResume(confirmed);
        setDirty(false);
        setStatus('最新の保存内容を確認しました。');
      } else {
        setResume((latest) => latest ? { ...latest, revision: confirmed.revision, updated_at: confirmed.updated_at } : null);
        setStatus('保存中に変更した内容があります。もう一度保存してください。');
      }
    } catch (cause) {
      if (live(expectedOwner, startedGeneration)) {
        // Even an unknown server response may have committed: never auto-resend.
        setAutoSavePaused(true);
        setRequiresReload(cause instanceof ResumeReadbackUnconfirmed || cause instanceof ResumeRevisionConflict);
        setError(cause instanceof Error ? cause.message : '保存結果を確認できませんでした。');
      }
    } finally {
      savingRef.current = false;
      if (live(expectedOwner, startedGeneration)) setSaving(false);
    }
  };

  // Web /resume debounce. Each new edit cancels the pending timer. Once a save
  // finishes, changes made during the write get a fresh debounce against the
  // confirmed revision. Blur/lock unmounts the timer; no speculative retries.
  useEffect(() => {
    if (!resume || !shouldScheduleResumeAutosave({
      ownerKey, loadedOwner, privateAllowed: canRead, loading, dirty, saving,
      pausedAfterError: autoSavePaused,
    })) return;
    const timer = setTimeout(() => { void save(); }, RESUME_AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [resume, ownerKey, loadedOwner, canRead, loading, dirty, saving, autoSavePaused]);

  // Review is read-only and never trusts unsaved local edits. Re-read all three
  // Web-owned canonical datasets under one pinned Clerk session before display.
  // Clear a previous candidate's review synchronously via the owner render gate.
  useEffect(() => {
    const request = ++reviewRequest.current;
    setReview(null);
    setReviewError(null);
    setReviewBusy(false);
    if (section !== 6 || !canRead || !ownerKey || loadedOwner !== ownerKey || !resume) return;
    if (dirty || saving || autoSavePaused) {
      setReviewError('入力の保存を確認してから内容を再取得できます。保存結果が不明な場合は最新の履歴書を読み込んでください。');
      return;
    }
    let active = true;
    const expectedOwner = ownerKey;
    const startedGeneration = generation.current;
    setReviewBusy(true);
    void (async () => {
      try {
        const pinned = await pinCandidateAction();
        if (!pinned?.isCurrent() ||
            candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== expectedOwner) {
          throw new Error('ログイン状態を確認できませんでした。');
        }
        const [canonicalResume, profile, prefs] = await Promise.all([
          getCandidateResume(pinned.client),
          getJobseekerProfile(pinned.client),
          getJobseekerMatchingPreferences(pinned.client),
        ]);
        if (!active || reviewRequest.current !== request || !pinned.isCurrent() ||
            !live(expectedOwner, startedGeneration)) return;
        // A newly registered candidate may have no profile row yet. The Web
        // preview handles this as empty fields, not an authorization failure.
        // A returned row with the wrong owner, however, must be rejected.
        if (profile && profile.clerk_user_id !== pinned.ownerId) {
          throw new Error('プロフィールの閲覧権限を確認できませんでした。');
        }
        if (canonicalResume.revision !== resume.revision ||
            JSON.stringify(toResumePayload(canonicalResume)) !== JSON.stringify(toResumePayload(resume))) {
          throw new Error('別の画面または端末で履歴書が変更されました。最新の履歴書を読み込んでください。');
        }
        setReview({ owner: expectedOwner, data: buildResumeReview(
          profile ?? { name: null, name_kana: null, phone: null, email: null,
            qualifications: [], years_of_experience: null },
          canonicalResume, prefs ?? emptyJobseekerMatchingPreferences, new Date(),
        ) });
      } catch {
        if (active && reviewRequest.current === request && live(expectedOwner, startedGeneration)) {
          setReviewError('正式データを確認できませんでした。再読み込みしてください。');
        }
      } finally {
        if (active && reviewRequest.current === request && live(expectedOwner, startedGeneration)) setReviewBusy(false);
      }
    })();
    return () => { active = false; reviewRequest.current += 1; };
  }, [section, ownerKey, loadedOwner, canRead, dirty, saving, autoSavePaused, resume?.revision, reviewRefresh]);

  const reloadLatest = () => {
    if (!shouldConfirmResumeReload(dirty)) { void load(); return; }
    const reloadOwner = ownerKey;
    const reloadGeneration = generation.current;
    Alert.alert('未保存の入力を破棄しますか？',
      '最新の履歴書を取得すると、この画面で未保存の変更は失われます。', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '破棄して再読み込み', style: 'destructive', onPress: () => {
          if (ownerRef.current !== reloadOwner || generation.current !== reloadGeneration ||
              !privacy.canAccessPrivateData()) return;
          void load();
        } },
      ]);
  };

  const confirmRemove = (kind: 'education' | 'employment', index: number) => {
    const expectedOwner = ownerKey;
    const expectedGeneration = generation.current;
    Alert.alert(kind === 'education' ? 'この学歴を削除しますか？' : 'この職歴を削除しますか？',
      '削除した内容は保存するまで正式データには反映されません。', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: () => {
          if (ownerRef.current !== expectedOwner || generation.current !== expectedGeneration ||
              !privacy.canAccessPrivateData()) return;
          edit((current) => ({ ...current, [kind]: current[kind].filter((_, i) => i !== index) }));
        } },
      ]);
  };
  const view = canRead && ownerKey === loadedOwner ? resume : null;
  if (!canRead || !ownerKey) return <View style={styles.center}><ActivityIndicator color="#E9265A" /></View>;
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <Text style={styles.heading}>履歴書・職務経歴書</Text>
    <Text style={styles.intro}>質問に答えながら履歴書データを編集できます。入力内容は約1.2秒後に自動保存されます。</Text>
    {loading ? <ActivityIndicator color="#E9265A" /> : null}
    {error ? <View style={styles.warning}><Text style={styles.warningText}>{error}</Text><Pressable accessibilityRole="button" style={styles.secondary} onPress={reloadLatest}><Text style={styles.buttonText}>最新の内容を読み込む</Text></Pressable></View> : null}
    {view ? <>
      <Text style={styles.progressLabel}>ステップ {section + 1} / {sections.length}</Text>
      <View style={styles.progressTrack} accessibilityLabel={'入力ステップ ' + (section + 1) + ' / ' + sections.length}><View style={[styles.progressFill, { width: `${Math.round(((section + 1) / sections.length) * 100)}%` as `${number}%` }]} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="履歴書の入力ステップ" contentContainerStyle={styles.steps}>
        {sections.map((name, index) => <Choice key={name} label={(index + 1) + '. ' + name} selected={section === index} onPress={() => setSection(index)} />)}
      </ScrollView>
      <View style={styles.card}>
        <Text style={styles.title}>{sectionQuestions[section]}</Text>
        {/* One mounted shared-profile editor across basic / qualifications / childcare:
            never mount competing profile-upsert writers for these steps. */}
        <ResumeChildcareEditor
          section={section === 0 ? 'basic' : section === 3 ? 'licenses' : section === 4 ? 'childcare' : null}
          qualificationAcquired={view.qualification_acquired}
          onQualificationAcquiredChange={(next) => change('qualification_acquired', next)}
          basicAddressFields={<>
            <Field label="生年月日" hint="西暦YYYY-MM-DD" value={view.birth_date} onChange={(v) => change('birth_date', v)} />
            <Field label="性別" value={view.gender} onChange={(v) => change('gender', v)} />
            <Field label="郵便番号" value={view.postal_code} onChange={(v) => change('postal_code', v)} />
            <Field label="住所" value={view.address} onChange={(v) => change('address', v)} />
            <Field label="住所のふりがな" value={view.address_kana} onChange={(v) => change('address_kana', v)} />
          </>}
          basicContactAddressField={<Field label="現住所以外の連絡先" value={view.contact_address} onChange={(v) => change('contact_address', v)} />}
        />
        {section === 1 ? <>
          {view.education.map((entry, index) => {
            const patch = (data: Partial<ResumeEducation>) => change('education', view.education.map((e, i) => i === index ? { ...e, ...data } : e));
            return <View style={styles.entry} key={entry.id}>
              <Text style={styles.entryTitle}>{entry.organization || '学校 ' + (index + 1)}</Text>
              <View style={styles.rowActions}>
                <Pressable accessibilityRole="button" accessibilityLabel={'学歴 ' + (index + 1) + ' を上へ移動'} disabled={index === 0}
                  style={[styles.rowAction, index === 0 && styles.disabled]} onPress={() => change('education', moveResumeEntry(view.education, index, -1))}><Text style={styles.buttonText}>↑ 上へ</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={'学歴 ' + (index + 1) + ' を下へ移動'} disabled={index === view.education.length - 1}
                  style={[styles.rowAction, index === view.education.length - 1 && styles.disabled]} onPress={() => change('education', moveResumeEntry(view.education, index, 1))}><Text style={styles.buttonText}>↓ 下へ</Text></Pressable>
              </View>
              <Field label="学校名" value={entry.organization} onChange={(v) => patch({ organization: v ?? '' })} />
              <Field label="学部・学科" value={entry.department} onChange={(v) => patch({ department: v })} />
              <ResumeYearMonthField label="入学した年月" value={entry.start_ym} onChange={(v) => patch({ start_ym: v })} />
              <ResumeYearMonthField label="卒業した年月" value={entry.end_ym} disabled={entry.is_current} onChange={(v) => patch({ end_ym: v })} />
              <Text style={styles.label}>卒業の状態</Text>
              <View style={styles.choices}>{statuses.map((label) => <Choice key={label} label={label} selected={entry.education_status === label} onPress={() => patch(educationStatusChange(entry, label))} />)}</View>
              <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => confirmRemove('education', index)}><Text style={styles.buttonText}>この学歴を削除</Text></Pressable>
            </View>;
          })}
          {canAppendResumeEntry(view.education, MAX_RESUME_EDUCATION)
            ? <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => change('education', [...view.education, { id: Crypto.randomUUID(), organization: '', department: null, start_ym: null, end_ym: null, is_current: false, education_status: null }])}><Text style={styles.buttonText}>＋ 学校を追加</Text></Pressable>
            : <Text style={styles.hint}>学歴は{MAX_RESUME_EDUCATION}件まで追加できます。</Text>}
        </> : null}
        {section === 2 ? <>
          {view.employment.map((entry, index) => {
            const patch = (data: Partial<ResumeEmployment>) => change('employment', view.employment.map((e, i) => i === index ? { ...e, ...data } : e));
            return <View style={styles.entry} key={entry.id}>
              <Text style={styles.entryTitle}>{entry.organization || '職場 ' + (index + 1)}</Text>
              <View style={styles.rowActions}>
                <Pressable accessibilityRole="button" accessibilityLabel={'職歴 ' + (index + 1) + ' を上へ移動'} disabled={index === 0}
                  style={[styles.rowAction, index === 0 && styles.disabled]} onPress={() => change('employment', moveResumeEntry(view.employment, index, -1))}><Text style={styles.buttonText}>↑ 上へ</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={'職歴 ' + (index + 1) + ' を下へ移動'} disabled={index === view.employment.length - 1}
                  style={[styles.rowAction, index === view.employment.length - 1 && styles.disabled]} onPress={() => change('employment', moveResumeEntry(view.employment, index, 1))}><Text style={styles.buttonText}>↓ 下へ</Text></Pressable>
              </View>
              <Field label="勤務先・施設名" value={entry.organization} onChange={(v) => patch({ organization: v ?? '' })} />
              <Field label="所属・部署" value={entry.department} onChange={(v) => patch({ department: v })} />
              <ResumeOptionField label="施設の種類" value={entry.facility_type} choices={facilityTypeOptions} onChange={(v) => patch({ facility_type: v })} />
              <ResumeOptionField label="雇用形態" value={entry.employment_type} choices={employmentTypeOptions} onChange={(v) => patch({ employment_type: v })} />
              <Field label="職種" value={entry.job_title} onChange={(v) => patch({ job_title: v })} />
              <ResumeYearMonthField label="働き始めた年月" value={entry.start_ym} onChange={(v) => patch({ start_ym: v })} />
              <View style={styles.toggle}><Text style={styles.label}>今もここで働いている</Text><Switch value={entry.is_current} onValueChange={(v) => patch(resumeCurrentChange(entry, v))} /></View>
              {!entry.is_current ? <ResumeYearMonthField label="辞めた年月" value={entry.end_ym} onChange={(v) => patch({ end_ym: v })} /> : null}
              <Field label="担当人数" value={entry.children_count} onChange={(v) => patch({ children_count: v })} />
              <Field label="役職" value={entry.management_role} onChange={(v) => patch({ management_role: v })} />
              <View style={styles.toggle}><Text>クラス担任</Text><Switch value={entry.class_lead} onValueChange={(v) => patch({ class_lead: v })} /></View>
              <Text style={styles.label}>担当年齢</Text>
              <View style={styles.choices}>{ageGroups.map((label) => <Choice key={label} label={label} selected={entry.age_groups.includes(label)} onPress={() => patch({ age_groups: entry.age_groups.includes(label) ? entry.age_groups.filter((x) => x !== label) : [...entry.age_groups, label] })} />)}</View>
              <Field label="業務内容" value={entry.duties} multiline onChange={(v) => patch({ duties: v })} />
              <Field label="実績・工夫したこと" value={entry.achievements} multiline onChange={(v) => patch({ achievements: v })} />
              {!entry.is_current ? <ResumeOptionField label="退職の理由（書き方）" value={entry.leaving_reason} choices={leavingReasonOptions} onChange={(v) => patch({ leaving_reason: v })} /> : null}
              <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => confirmRemove('employment', index)}><Text style={styles.buttonText}>この職歴を削除</Text></Pressable>
            </View>;
          })}
          {canAppendResumeEntry(view.employment, MAX_RESUME_EMPLOYMENT)
            ? <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => change('employment', [...view.employment, { id: Crypto.randomUUID(), organization: '', department: null, start_ym: null, end_ym: null, is_current: false, facility_type: null, employment_type: null, job_title: null, age_groups: [], class_lead: false, management_role: null, children_count: null, duties: null, achievements: null, leaving_reason: null }])}><Text style={styles.buttonText}>＋ 職場を追加</Text></Pressable>
            : <Text style={styles.hint}>職歴は{MAX_RESUME_EMPLOYMENT}件まで追加できます。</Text>}
        </> : null}
        {section === 5 ? <>
          <Field label="職務要約" value={view.work_summary} multiline onChange={(v) => change('work_summary', v)} />
          <Field label="自己PR" value={view.self_pr} multiline onChange={(v) => change('self_pr', v)} />
          <Field label="得意なこと・強み" value={view.strengths} multiline onChange={(v) => change('strengths', v)} />
          <Field label="志望動機" value={view.motivation} multiline onChange={(v) => change('motivation', v)} />
          <Field label="本人希望記入欄" value={view.personal_requests} multiline onChange={(v) => change('personal_requests', v)} />
        </> : null}
        {section === 6 ? <>
          <ResumeReviewPanel review={review?.owner === ownerKey && !dirty && !saving && !autoSavePaused ? review.data : null}
            photoDataUri={canRead && loadedOwner === ownerKey ? photoPreview?.dataUri ?? null : null}
            loading={reviewBusy} error={reviewError}
            onRefresh={() => setReviewRefresh((n) => n + 1)} onReloadResume={reloadLatest} />
          <View style={styles.photoCard}>
            <Text style={styles.label}>証明写真（任意）</Text>
            <Text style={styles.hint}>この画面では端末上のプレビューのみです。写真だけを送信しません。画面を離れると選択内容は消去されます。PDFへの組込み・保存はまだ対応していません。</Text>
            {photoError ? <Text accessibilityRole="alert" style={styles.warningText}>{photoError}</Text> : null}
            {photoPreview && canRead ? <Text style={styles.hint}>写真を選択しました。履歴書プレビューで確認できます。</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={photoPreview ? '証明写真を変更' : '証明写真を選ぶ'}
              disabled={photoBusy} style={[styles.secondary, photoBusy && styles.disabled]}
              onPress={() => void pickResumePhoto()}>
              <Text style={styles.buttonText}>{photoBusy ? '写真を確認中…' : photoPreview ? '写真を変更' : '写真を選ぶ'}</Text>
            </Pressable>
            {photoPreview ? <Pressable accessibilityRole="button" style={styles.secondary}
              onPress={() => { setPhotoPreview(null); setPhotoError(null); }}>
              <Text style={styles.buttonText}>写真を外す</Text>
            </Pressable> : null}
          </View>
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.push('/(tabs)/profile')}><Text style={styles.buttonText}>応募書類の管理を開く</Text></Pressable>
        </> : null}
      </View>
      {dirty ? <Text style={styles.hint}>{autoSavePaused ? (requiresReload ? '保存結果が不明、または他の端末が先に保存しました。自動再送信は停止しています。最新の内容を確認してください。' : '入力を修正すると自動保存を再開できます。') : saving ? '保存中です。' : '未保存の入力があります。約1.2秒後に自動保存します。'}</Text> : null}
      {status ? <Text style={styles.success}>{status}</Text> : null}
      <Pressable accessibilityRole="button" style={[styles.primary, (!dirty || saving || autoSavePaused) && styles.disabled]} disabled={!dirty || saving || autoSavePaused} onPress={() => void save()}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{dirty ? (autoSavePaused ? '保存結果の確認が必要です' : '今すぐ保存する') : '保存済み'}</Text>}
      </Pressable>
      <View style={styles.navigation}>
        <Pressable accessibilityRole="button" style={styles.secondaryHalf} disabled={section === 0} onPress={() => setSection((s) => Math.max(0, s - 1))}><Text style={styles.buttonText}>戻る</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.secondaryHalf} disabled={section === sections.length - 1} onPress={() => setSection((s) => Math.min(sections.length - 1, s + 1))}><Text style={styles.buttonText}>次へ</Text></Pressable>
      </View>
    </> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF8FA' },
  page: { padding: 16, paddingBottom: 48, gap: 14, flexGrow: 1, backgroundColor: '#FFF8FA' },
  heading: { fontSize: 24, fontWeight: '900', color: '#30212B' },
  intro: { fontSize: 15, lineHeight: 22, color: '#62575E' },
  steps: { gap: 8, paddingVertical: 2 },
  progressLabel: { fontSize: 14, fontWeight: '800', color: '#57454F' },
  progressTrack: { height: 6, borderRadius: 6, overflow: 'hidden', backgroundColor: '#F8DAE4' },
  progressFill: { height: 6, borderRadius: 6, backgroundColor: '#E9265A' },
  choice: { paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: '#E5D1D9', borderRadius: 12, minHeight: 44, justifyContent: 'center', backgroundColor: '#fff' },
  selected: { borderColor: '#E9265A', backgroundColor: '#FFF0F4' },
  choiceLabel: { color: '#453741', fontSize: 14, fontWeight: '700' },
  selectedLabel: { color: '#B82051' },
  card: { borderRadius: 18, backgroundColor: '#fff', padding: 16, gap: 14, borderWidth: 1, borderColor: '#F5DDE5' },
  photoCard: { borderWidth: 1, borderColor: '#F5DDE5', backgroundColor: '#fff', padding: 14, borderRadius: 14, gap: 10 },
  title: { fontSize: 20, color: '#30212B', fontWeight: '800' },
  field: { gap: 7 },
  label: { color: '#34232E', fontWeight: '800', fontSize: 15 },
  hint: { fontSize: 14, color: '#6A5E67', lineHeight: 21 },
  input: { fontSize: 16, minHeight: 48, borderWidth: 1, borderColor: '#D8C9D0', borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 11, color: '#281D25' },
  textArea: { minHeight: 112 },
  entry: { borderWidth: 1, borderColor: '#F4DAE4', backgroundColor: '#FFFDFE', padding: 14, borderRadius: 14, gap: 12 },
  entryTitle: { fontSize: 17, fontWeight: '800', color: '#34232E' },
  optionTrigger: { minHeight: 48, borderWidth: 1, borderColor: '#D8C9D0', borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowActions: { flexDirection: 'row', gap: 8 },
  rowAction: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: '#E5D1D9', alignItems: 'center', justifyContent: 'center' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  primary: { backgroundColor: '#E9265A', minHeight: 52, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.55 },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  secondary: { minHeight: 46, borderWidth: 1, borderColor: '#D8C9D0', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryHalf: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: '#D8C9D0', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, color: '#34232E', fontWeight: '800' },
  navigation: { flexDirection: 'row', gap: 10 },
  warning: { padding: 14, borderRadius: 12, backgroundColor: '#FFF0F0', gap: 12 },
  warningText: { color: '#A12636', fontSize: 15, fontWeight: '700' },
  success: { color: '#087044', backgroundColor: '#E8FFF2', padding: 12, borderRadius: 12, fontWeight: '800' },
});
