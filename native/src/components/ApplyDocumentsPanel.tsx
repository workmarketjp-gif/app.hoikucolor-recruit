import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { listJobseekerDocuments, type JobseekerDocument, type JobseekerDocumentType } from '../lib/documentVaultApi';
import {
  DOCUMENT_TYPE_LABELS,
  REQUIREMENT_LABELS,
  buildApplyDocumentRows,
  initialApplySelection,
  joinDocumentLabels,
  missingRequiredDocuments,
  selectedDocumentIds,
  type ApplyDocumentSelection,
  type JobDocumentRequirements,
} from '../lib/documentTypes';
import { getJobDocumentRequirements } from '../lib/jobDocumentRequirementApi';
import { DocumentVaultSection } from './DocumentVaultSection';
import { reconcileApplyVaultSelection, type ApplyVaultChange } from '../lib/applyVaultSelection';

type Props = {
  jobId: string;
  submitting: boolean;
  onCancel: () => void;
  /** Called with the chosen vault document ids, only when nothing required is missing. */
  onSubmit: (documentIds: string[]) => void;
};

/**
 * Native counterpart of Web's ApplyDocumentsStep. Selection and blocking rules come from the
 * shared documentTypes module (byte-identical to src/lib/documentTypes.ts). Uploading a missing
 * document reuses DocumentVaultSection, which owns the picker-cache and account-switch safety.
 */
export function ApplyDocumentsPanel({ jobId, submitting, onCancel, onSubmit }: Props) {
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [requirements, setRequirements] = useState<JobDocumentRequirements | null>(null);
  const [documents, setDocuments] = useState<JobseekerDocument[]>([]);
  const [selection, setSelection] = useState<ApplyDocumentSelection>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addingType, setAddingType] = useState<JobseekerDocumentType | null>(null);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [vaultRefreshing, setVaultRefreshing] = useState(false);
  const knownDocuments = useRef<JobseekerDocument[]>([]);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    // Fail closed during a requirements retry: never submit from stale rows.
    setRequirements(null);
    setDocuments([]);
    knownDocuments.current = [];
    setSelection({});
    setAddingType(null);
    setVaultRefreshing(false);
    setTriedSubmit(false);
    setLoadError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const [nextRequirements, nextDocuments] = await Promise.all([
        getJobDocumentRequirements(pinned.client, jobId),
        listJobseekerDocuments(pinned.client),
      ]);
      if (!pinned.isCurrent() || current !== generation.current) return;
      setRequirements(nextRequirements);
      knownDocuments.current = nextDocuments;
      setDocuments(nextDocuments);
      setSelection(initialApplySelection(buildApplyDocumentRows(nextRequirements, nextDocuments)));
    } catch {
      if (current === generation.current) setLoadError('応募に使う書類を読み込めませんでした。もう一度お試しください。');
    }
  }, [jobId, pinCandidateAction]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const rows = useMemo(() => (requirements ? buildApplyDocumentRows(requirements, documents) : []), [requirements, documents]);
  const missing = useMemo(() => missingRequiredDocuments(rows, selection), [rows, selection]);

  // The vault sends [] during loading. It is not a verified empty list.
  // A new file is selected only after an explicit canonical upload.
  const onVaultChanged = useCallback((next: JobseekerDocument[], change: ApplyVaultChange = 'loaded') => {
    if (change === 'loading') {
      setVaultRefreshing(true);
      return;
    }
    const previous = knownDocuments.current;
    knownDocuments.current = next;
    setDocuments(next);
    setVaultRefreshing(false);
    setSelection((current) => reconcileApplyVaultSelection(previous, next, current, addingType, change));
  }, [addingType]);

  const submit = () => {
    setTriedSubmit(true);
    if (missing.length || submitting || vaultRefreshing || !requirements) return;
    onSubmit(selectedDocumentIds(rows, selection));
  };

  if (loadError) {
    return <View style={styles.card}>
      <Text style={styles.error}>{loadError}</Text>
      <Pressable style={styles.secondary} onPress={() => void load()} accessibilityRole="button"><Text style={styles.secondaryText}>もう一度読み込む</Text></Pressable>
      <Pressable style={styles.secondary} onPress={onCancel} accessibilityRole="button"><Text style={styles.secondaryText}>戻る</Text></Pressable>
    </View>;
  }
  if (!requirements) {
    return <View style={styles.card}><ActivityIndicator /><Text>この求人で必要な書類を確認しています…</Text></View>;
  }

  return <View style={styles.card}>
    <Text style={styles.title}>応募の前に、送る書類を確認してください</Text>
    <Text style={styles.subtle}>
      {requirements.configured
        ? '園がこの求人で指定している書類です。「必須」の書類がそろうと応募できます。'
        : 'この求人では、園から書類の指定はありません。保存済みの書類を一緒に送ることができます。'}
    </Text>

    {rows.length ? rows.map((row) => {
      const selectedId = selection[row.type] ?? null;
      const highlight = triedSubmit && missing.includes(row.type);
      return <View key={row.type} style={[styles.row, highlight && styles.rowMissing]}>
        <View style={styles.rowHead}>
          <Text style={styles.rowTitle}>{DOCUMENT_TYPE_LABELS[row.type]}</Text>
          <Text style={[styles.badge, row.level === 'required' && styles.badgeRequired]}>{REQUIREMENT_LABELS[row.level]}</Text>
        </View>
        {row.note ? <Text style={styles.subtle}>園からのメモ：{row.note}</Text> : null}
        {row.level === 'requested_later' ? <Text style={styles.subtle}>応募のあとで、園から提出をお願いされることがあります。今は送らなくても応募できます。</Text> : null}
        {row.candidates.map((document) => <Pressable
          key={document.id}
          style={[styles.option, selectedId === document.id && styles.optionSelected]}
          onPress={() => setSelection((current) => ({ ...current, [row.type]: document.id }))}
          accessibilityRole="radio"
          accessibilityState={{ checked: selectedId === document.id }}
          disabled={submitting || vaultRefreshing}
        >
          <Text numberOfLines={1} style={styles.optionText}>{selectedId === document.id ? '● ' : '○ '}{document.title}</Text>
          {document.is_default ? <Text style={styles.optionSub}>応募時に使う書類</Text> : null}
        </Pressable>)}
        {row.level !== 'required' && row.candidates.length ? <Pressable
          style={[styles.option, !selectedId && styles.optionSelected]}
          onPress={() => setSelection((current) => ({ ...current, [row.type]: null }))}
          accessibilityRole="radio"
          accessibilityState={{ checked: !selectedId }}
          disabled={submitting || vaultRefreshing}
        >
          <Text style={styles.optionText}>{!selectedId ? '● ' : '○ '}{row.level === 'requested_later' ? '今は送らない' : '送らない'}</Text>
        </Pressable> : null}
        {!row.candidates.length ? <Text style={styles.empty}>{row.level === 'required' ? 'まだ保存されていません。この応募に必要です。' : 'まだ保存されていません。'}</Text> : null}
        <Pressable style={styles.secondary} disabled={submitting} onPress={() => {
          const closing = addingType === row.type;
          setAddingType(closing ? null : row.type);
          if (closing && vaultRefreshing) void load();
        }} accessibilityRole="button">
          <Text style={styles.secondaryText}>{addingType === row.type ? '閉じる' : `${DOCUMENT_TYPE_LABELS[row.type]}を追加`}</Text>
        </Pressable>
        {addingType === row.type ? <DocumentVaultSection initialType={row.type} onDocumentsChanged={onVaultChanged} /> : null}
      </View>;
    }) : <Text style={styles.subtle}>送る書類はありません。書類なしで応募できます。履歴書などは、応募後に応募内容の画面から追加で提出することもできます。</Text>}

    <Text style={styles.note}>選んだ書類は、この応募先の園にだけ提出用のコピーが共有されます。</Text>
    {vaultRefreshing ? <Text style={styles.hint} accessibilityLiveRegion="polite">書類一覧を再確認しています。確認が終わるまで応募できません。</Text> : null}
    {missing.length ? <Text style={triedSubmit ? styles.error : styles.hint} accessibilityLiveRegion="polite">
      {joinDocumentLabels(missing)}はこの求人の応募に必要です。保存済みの書類を選ぶか、ここで追加してください。
    </Text> : null}

    <Pressable style={styles.primary} disabled={submitting || vaultRefreshing} onPress={submit} accessibilityRole="button" accessibilityState={{ disabled: submitting || vaultRefreshing }}>
      <Text style={styles.primaryText}>{submitting ? '応募しています…' : 'この内容で応募する'}</Text>
    </Pressable>
    <Pressable style={styles.secondary} disabled={submitting} onPress={onCancel} accessibilityRole="button">
      <Text style={styles.secondaryText}>戻る</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  title: { fontSize: 18, fontWeight: '900' },
  subtle: { color: '#606873', lineHeight: 20 },
  note: { color: '#606873', fontSize: 13, lineHeight: 18 },
  hint: { fontWeight: '800', lineHeight: 20 },
  row: { borderWidth: 1, borderColor: '#e3e6ea', borderRadius: 14, padding: 12, gap: 8 },
  rowMissing: { borderColor: '#e72346' },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 16, fontWeight: '900', flexShrink: 1 },
  badge: { fontSize: 13, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12, backgroundColor: '#eef1f5', color: '#4a5566', overflow: 'hidden' },
  badgeRequired: { backgroundColor: '#fff0f3', color: '#e72346' },
  option: { minHeight: 48, borderWidth: 1, borderColor: '#e3e6ea', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center' },
  optionSelected: { borderColor: '#e72346', backgroundColor: '#fff0f3' },
  optionText: { fontSize: 15 },
  optionSub: { fontSize: 13, color: '#606873' },
  empty: { fontWeight: '800' },
  primary: { minHeight: 52, borderRadius: 13, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryText: { color: '#fff', fontWeight: '900' },
  secondary: { minHeight: 48, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryText: { fontWeight: '800' },
  error: { color: '#b42318', backgroundColor: '#fff1f0', padding: 12, borderRadius: 10 },
});
