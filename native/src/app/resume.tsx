import { useSession } from '@clerk/expo';
import * as Crypto from 'expo-crypto';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { usePrivateDataQuarantine } from '../hooks/usePrivateDataQuarantine';
import { usePrivateScreenCapture } from '../hooks/usePrivateScreenCapture';
import { candidateViewOwnerKey } from '../lib/candidateViewOwner';
import {
  getCandidateResume, saveCandidateResumeAndConfirm, type CandidateResume,
  type ResumeEducation, type ResumeEmployment,
} from '../lib/resumeCanonical';

const sections = ['基本情報', '学歴', '職歴', '資格', '保育経験', '自己PR', '確認・保存'] as const;
const statuses = ['卒業', '卒業見込み', '修了', '中退', '在学中'];
const ageGroups = ['0歳児', '1歳児', '2歳児', '3歳児', '4歳児', '5歳児', '異年齢', 'フリー'];
const qualificationOptions = ['保育士', '幼稚園教諭', '保育教諭', '看護師', '准看護師', '栄養士', '管理栄養士', '調理師', '子育て支援員', '普通自動車第一種運転免許'];
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
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = (owner: string, request: number) =>
    request === generation.current && ownerRef.current === owner && privacy.canAccessPrivateData();
  const edit = (update: (value: CandidateResume) => CandidateResume) => {
    if (!canRead || loadedOwner !== ownerKey) return;
    draftRevision.current += 1;
    setStatus(null);
    setError(null);
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
    if (!ownerKey || privacy.shieldVisible || !privacy.canAccessPrivateData()) {
      generation.current += 1;
      setLoadedOwner(null);
      setResume(null);
      setDirty(false);
      setLoading(true);
      return;
    }
    void load();
    return () => {
      generation.current += 1;
      setLoadedOwner(null);
      setResume(null);
    };
  }, [ownerKey, privacy.shieldVisible, privacy.canAccessPrivateData, load]));

  const save = async () => {
    if (savingRef.current || !resume || !dirty || !canRead || loadedOwner !== ownerKey || !ownerKey) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const submitted = resume;
    const submittedRevision = draftRevision.current;
    const startedGeneration = generation.current;
    const expectedOwner = ownerKey;
    try {
      const pinned = await pinCandidateAction();
      if (!pinned?.isCurrent() || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== expectedOwner || !live(expectedOwner, startedGeneration)) return;
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
      if (live(expectedOwner, startedGeneration)) setError(cause instanceof Error ? cause.message : '保存結果を確認できませんでした。');
    } finally {
      savingRef.current = false;
      if (live(expectedOwner, startedGeneration)) setSaving(false);
    }
  };

  const view = canRead && ownerKey === loadedOwner ? resume : null;
  if (!canRead || !ownerKey) return <View style={styles.center}><ActivityIndicator color="#E9265A" /></View>;
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <Text style={styles.heading}>履歴書・職務経歴書</Text>
    <Text style={styles.intro}>Web版と同じ正式な履歴書データを編集します。PDFの作成・書類登録は別の操作です。</Text>
    {loading ? <ActivityIndicator color="#E9265A" /> : null}
    {error ? <View style={styles.warning}><Text style={styles.warningText}>{error}</Text><Pressable accessibilityRole="button" style={styles.secondary} onPress={() => void load()}><Text style={styles.buttonText}>最新の内容を読み込む</Text></Pressable></View> : null}
    {view ? <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="履歴書の入力ステップ" contentContainerStyle={styles.steps}>
        {sections.map((name, index) => <Choice key={name} label={(index + 1) + '. ' + name} selected={section === index} onPress={() => setSection(index)} />)}
      </ScrollView>
      <View style={styles.card}>
        <Text style={styles.title}>{sections[section]}</Text>
        {section === 0 ? <>
          <Field label="生年月日" hint="西暦YYYY-MM-DD" value={view.birth_date} onChange={(v) => change('birth_date', v)} />
          <Field label="性別" value={view.gender} onChange={(v) => change('gender', v)} />
          <Field label="郵便番号" value={view.postal_code} onChange={(v) => change('postal_code', v)} />
          <Field label="住所" value={view.address} onChange={(v) => change('address', v)} />
          <Field label="住所（ふりがな）" value={view.address_kana} onChange={(v) => change('address_kana', v)} />
          <Field label="連絡先住所（現住所と異なる場合）" value={view.contact_address} onChange={(v) => change('contact_address', v)} />
        </> : null}
        {section === 1 ? <>
          {view.education.map((entry, index) => {
            const patch = (data: Partial<ResumeEducation>) => change('education', view.education.map((e, i) => i === index ? { ...e, ...data } : e));
            return <View style={styles.entry} key={entry.id}>
              <Text style={styles.entryTitle}>学歴 {index + 1}</Text>
              <Field label="学校名" value={entry.organization} onChange={(v) => patch({ organization: v ?? '' })} />
              <Field label="学部・学科" value={entry.department} onChange={(v) => patch({ department: v })} />
              <Field label="入学年月" hint="YYYY-MM" value={entry.start_ym} onChange={(v) => patch({ start_ym: v })} />
              <Field label="卒業・修了年月" hint="YYYY-MM" value={entry.end_ym} onChange={(v) => patch({ end_ym: v })} />
              <View style={styles.choices}>{statuses.map((label) => <Choice key={label} label={label} selected={entry.education_status === label} onPress={() => patch({ education_status: label })} />)}</View>
              <View style={styles.toggle}><Text>在学中</Text><Switch value={entry.is_current} onValueChange={(v) => patch({ is_current: v })} /></View>
              <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => change('education', view.education.filter((_, i) => i !== index))}><Text style={styles.buttonText}>この学歴を削除</Text></Pressable>
            </View>;
          })}
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => change('education', [...view.education, { id: Crypto.randomUUID(), organization: '', department: null, start_ym: null, end_ym: null, is_current: false, education_status: null }])}><Text style={styles.buttonText}>＋ 学歴を追加</Text></Pressable>
        </> : null}
        {section === 2 ? <>
          {view.employment.map((entry, index) => {
            const patch = (data: Partial<ResumeEmployment>) => change('employment', view.employment.map((e, i) => i === index ? { ...e, ...data } : e));
            return <View style={styles.entry} key={entry.id}>
              <Text style={styles.entryTitle}>職歴 {index + 1}</Text>
              <Field label="勤務先・施設名" value={entry.organization} onChange={(v) => patch({ organization: v ?? '' })} />
              <Field label="所属・部署" value={entry.department} onChange={(v) => patch({ department: v })} />
              <Field label="施設種類" value={entry.facility_type} onChange={(v) => patch({ facility_type: v })} />
              <Field label="雇用形態" value={entry.employment_type} onChange={(v) => patch({ employment_type: v })} />
              <Field label="職種" value={entry.job_title} onChange={(v) => patch({ job_title: v })} />
              <Field label="入職年月" hint="YYYY-MM" value={entry.start_ym} onChange={(v) => patch({ start_ym: v })} />
              <Field label="退職年月" hint="YYYY-MM" value={entry.end_ym} onChange={(v) => patch({ end_ym: v })} />
              <View style={styles.toggle}><Text>在職中</Text><Switch value={entry.is_current} onValueChange={(v) => patch({ is_current: v })} /></View>
              <Field label="担当人数" value={entry.children_count} onChange={(v) => patch({ children_count: v })} />
              <Field label="役職" value={entry.management_role} onChange={(v) => patch({ management_role: v })} />
              <View style={styles.toggle}><Text>クラス担任</Text><Switch value={entry.class_lead} onValueChange={(v) => patch({ class_lead: v })} /></View>
              <Text style={styles.label}>担当年齢</Text>
              <View style={styles.choices}>{ageGroups.map((label) => <Choice key={label} label={label} selected={entry.age_groups.includes(label)} onPress={() => patch({ age_groups: entry.age_groups.includes(label) ? entry.age_groups.filter((x) => x !== label) : [...entry.age_groups, label] })} />)}</View>
              <Field label="業務内容" value={entry.duties} multiline onChange={(v) => patch({ duties: v })} />
              <Field label="実績・工夫したこと" value={entry.achievements} multiline onChange={(v) => patch({ achievements: v })} />
              <Field label="退職理由" value={entry.leaving_reason} onChange={(v) => patch({ leaving_reason: v })} />
              <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => change('employment', view.employment.filter((_, i) => i !== index))}><Text style={styles.buttonText}>この職歴を削除</Text></Pressable>
            </View>;
          })}
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => change('employment', [...view.employment, { id: Crypto.randomUUID(), organization: '', department: null, start_ym: null, end_ym: null, is_current: false, facility_type: null, employment_type: null, job_title: null, age_groups: [], class_lead: false, management_role: null, children_count: null, duties: null, achievements: null, leaving_reason: null }])}><Text style={styles.buttonText}>＋ 職歴を追加</Text></Pressable>
        </> : null}
        {section === 3 ? <>
          <Text style={styles.hint}>取得済み資格の年月を記録します。資格の追加・削除はマイページから行えます。</Text>
          {[...new Set([...qualificationOptions, ...Object.keys(view.qualification_acquired)])].map((name) => (
            <Field key={name} label={name + '・取得年月（YYYY-MM、未取得は空欄）'}
              value={view.qualification_acquired[name] ?? null}
              onChange={(v) => {
                const next = { ...view.qualification_acquired };
                if (v) next[name] = v; else delete next[name];
                change('qualification_acquired', next);
              }} />
          ))}
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.push('/(tabs)/profile')}><Text style={styles.buttonText}>資格・免許の登録を開く</Text></Pressable>
        </> : null}
        {section === 4 ? <>
          <Text style={styles.hint}>保育経験、担当年齢、リーダー経験はプロフィールと希望条件の正式データから利用されます。</Text>
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.push('/scouts' as never)}><Text style={styles.buttonText}>保育経験・希望条件の編集</Text></Pressable>
        </> : null}
        {section === 5 ? <>
          <Field label="職務要約" value={view.work_summary} multiline onChange={(v) => change('work_summary', v)} />
          <Field label="自己PR" value={view.self_pr} multiline onChange={(v) => change('self_pr', v)} />
          <Field label="得意なこと・強み" value={view.strengths} multiline onChange={(v) => change('strengths', v)} />
          <Field label="志望動機" value={view.motivation} multiline onChange={(v) => change('motivation', v)} />
          <Field label="本人希望記入欄" value={view.personal_requests} multiline onChange={(v) => change('personal_requests', v)} />
        </> : null}
        {section === 6 ? <>
          <Text style={styles.hint}>学歴 {view.education.filter((e) => e.organization.trim()).length}件、職歴 {view.employment.filter((e) => e.organization.trim()).length}件。</Text>
          <Text style={styles.hint}>正式な保存内容はWeb版でも確認できます。PDF作成は現在のNative画面では提供していません。</Text>
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.push('/(tabs)/profile')}><Text style={styles.buttonText}>応募書類の管理を開く</Text></Pressable>
        </> : null}
      </View>
      {dirty ? <Text style={styles.hint}>未保存の入力があります。画面を離れる前に保存してください。</Text> : null}
      {status ? <Text style={styles.success}>{status}</Text> : null}
      <Pressable accessibilityRole="button" style={[styles.primary, (!dirty || saving) && styles.disabled]} disabled={!dirty || saving} onPress={() => void save()}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{dirty ? '変更を保存する' : '保存済み'}</Text>}
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
  choice: { paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: '#E5D1D9', borderRadius: 12, minHeight: 44, justifyContent: 'center', backgroundColor: '#fff' },
  selected: { borderColor: '#E9265A', backgroundColor: '#FFF0F4' },
  choiceLabel: { color: '#453741', fontSize: 14, fontWeight: '700' },
  selectedLabel: { color: '#B82051' },
  card: { borderRadius: 18, backgroundColor: '#fff', padding: 16, gap: 14, borderWidth: 1, borderColor: '#F5DDE5' },
  title: { fontSize: 20, color: '#30212B', fontWeight: '800' },
  field: { gap: 7 },
  label: { color: '#34232E', fontWeight: '800', fontSize: 15 },
  hint: { fontSize: 14, color: '#6A5E67', lineHeight: 21 },
  input: { fontSize: 16, minHeight: 48, borderWidth: 1, borderColor: '#D8C9D0', borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 11, color: '#281D25' },
  textArea: { minHeight: 112 },
  entry: { borderWidth: 1, borderColor: '#F4DAE4', backgroundColor: '#FFFDFE', padding: 14, borderRadius: 14, gap: 12 },
  entryTitle: { fontSize: 17, fontWeight: '800', color: '#34232E' },
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
