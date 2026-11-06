import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ResumeReview } from '../lib/resumeReviewModel';

type Props = {
  review: ResumeReview | null;
  photoDataUri?: string | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onReloadResume: () => void;
};
function Detail({ title, value }: { title: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.detailLabel}>{title}</Text><Text style={styles.detailText}>{value || '—'}</Text></View>;
}
/** Data-only review: does not imply a PDF has been generated or uploaded. */
export function ResumeReviewPanel({ review, photoDataUri, loading, error, onRefresh, onReloadResume }: Props) {
  const [activePreview, setActivePreview] = useState<'resume' | 'work_history'>('resume');
  return <View style={styles.root}>
    <View style={styles.header}>
      <Text style={styles.heading}>履歴書・職務経歴書の内容確認</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="正式データを再取得" onPress={onRefresh} style={styles.refresh}>
        <Text style={styles.refreshLabel}>↻ 再読み込み</Text>
      </Pressable>
    </View>
    <Text style={styles.note}>正式に保存されたプロフィール・履歴書・希望条件を取得して表示します。資格は本人が申告した情報で、確認済みの証明ではありません。</Text>
    {loading ? <ActivityIndicator accessibilityLabel="履歴書の最新データを取得中" color="#E9265A" /> : null}
    {error ? <View style={styles.errorGroup}>
      <Text style={styles.error} accessibilityRole="alert">{error}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="履歴書の入力を再取得" onPress={onReloadResume} style={styles.refresh}>
        <Text style={styles.refreshLabel}>履歴書の入力を再取得</Text>
      </Pressable>
    </View> : null}
    {review ? <>
      {review.gaps.length ? <View style={styles.notice}>
        <Text style={styles.noticeTitle}>入力を確認したい項目</Text>
        <Text style={styles.note}>未入力でもプレビューできますが、PDF作成前に確認してください。</Text>
        <Text style={styles.noticeText}>{review.gaps.join('、')}</Text>
      </View> : <Text style={styles.ok}>Web版の必須確認項目に不足はありません。</Text>}
      <View style={styles.previewTabs} accessibilityLabel="プレビューを切り替える">
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: activePreview === 'resume' }}
          style={[styles.previewTab, activePreview === 'resume' && styles.previewTabSelected]}
          onPress={() => setActivePreview('resume')}>
          <Text style={[styles.refreshLabel, activePreview === 'resume' && styles.previewTabSelectedText]}>履歴書</Text>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: activePreview === 'work_history' }}
          style={[styles.previewTab, activePreview === 'work_history' && styles.previewTabSelected]}
          onPress={() => setActivePreview('work_history')}>
          <Text style={[styles.refreshLabel, activePreview === 'work_history' && styles.previewTabSelectedText]}>職務経歴書</Text>
        </Pressable>
      </View>
      {activePreview === 'resume' ? <View style={styles.paper}>
        <Text style={styles.paperTitle}>履歴書</Text>
        <Text style={styles.date}>{review.createdOn}</Text>
        <Detail title="ふりがな" value={review.kana} />
        <Detail title="氏名" value={review.name} />
        <View style={styles.photoLine}>
          {photoDataUri
            ? <Image accessibilityLabel="選択した証明写真のプレビュー" source={{ uri: photoDataUri }} style={styles.photo} resizeMode="cover" />
            : <View style={styles.photoEmpty}><Text style={styles.photoPlaceholder}>写真</Text></View>}
          <Text style={styles.photoHint}>写真はこの画面での確認用です。下の作成ボタンを押すと履歴書PDFに組み込みます。</Text>
        </View>
        <Detail title="生年月日" value={review.birth} />
        <Detail title="性別" value={review.gender} />
        <Detail title="住所" value={review.address} />
        <Detail title="連絡先" value={review.contact} />
        <Text style={styles.sectionTitle}>学歴・職歴</Text>
        {review.history.map((row, i) => <View key={`history-${i}`} style={styles.historyRow}>
          <Text style={styles.dateCell}>{[row.year, row.month].filter(Boolean).join(' / ')}</Text>
          <Text style={[styles.body, row.align === 'center' && styles.centerText, row.align === 'right' && styles.rightText]}>{row.label}</Text>
        </View>)}
        <Text style={styles.sectionTitle}>免許・資格（本人申告）</Text>
        {review.licenses.length ? review.licenses.map((row, i) => <View key={`license-${i}`} style={styles.historyRow}>
          <Text style={styles.dateCell}>{[row.year, row.month].filter(Boolean).join(' / ')}</Text>
          <Text style={styles.body}>{row.label}</Text>
        </View>) : <Text style={styles.body}>登録なし</Text>}
        {review.appeal.map((section) => <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text><Text style={styles.body}>{section.lines.join('\n')}</Text>
        </View>)}
        <Text style={styles.sectionTitle}>本人希望記入欄</Text><Text style={styles.body}>{review.requests}</Text>
      </View> : <View style={styles.paper}>
        <Text style={styles.paperTitle}>職務経歴書</Text>
        <Text style={styles.date}>{review.createdOn}</Text>
        <Detail title="氏名" value={review.name} />
        {review.work.map((section, i) => <View key={`work-${i}`} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.lines.map((line, j) => <Text key={`${i}-${j}`} style={styles.body}>{line}</Text>)}
        </View>)}
        {!review.work.length ? <Text style={styles.body}>職務経歴・自己PRの登録がありません。</Text> : null}
      </View>}
      <Text style={styles.note}>このプレビューはNative画面での確認用です。正式データを確認後、下のボタンからA4 PDFを作成し非公開の書類管理に保存できます。応募は自動送信されません。</Text>
    </> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { gap: 13 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
  heading: { color: '#32232C', fontWeight: '900', fontSize: 18, flexShrink: 1 },
  refresh: { minHeight: 44, borderRadius: 11, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: '#E6C5D0' },
  refreshLabel: { color: '#A9184C', fontWeight: '800', fontSize: 14 },
  note: { color: '#645963', fontSize: 14, lineHeight: 21 },
  errorGroup: { gap: 9 },
  error: { backgroundColor: '#FFF0F0', padding: 12, borderRadius: 9, color: '#AA2034', fontWeight: '700', lineHeight: 22 },
  notice: { backgroundColor: '#FFF3E4', borderColor: '#F2D5AC', borderWidth: 1, borderRadius: 12, padding: 12, gap: 5 },
  noticeTitle: { color: '#80500D', fontWeight: '900', fontSize: 15 },
  noticeText: { color: '#765016', fontSize: 15, lineHeight: 22 },
  ok: { color: '#087044', fontWeight: '800', fontSize: 14 },
  previewTabs: { flexDirection: 'row', gap: 8 },
  previewTab: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E6C5D0', borderRadius: 12, backgroundColor: '#fff' },
  previewTabSelected: { backgroundColor: '#E9265A', borderColor: '#E9265A' },
  previewTabSelectedText: { color: '#fff' },
  paper: { borderColor: '#E7D5DD', borderWidth: 1, backgroundColor: '#fff', padding: 14, gap: 8, borderRadius: 10 },
  paperTitle: { textAlign: 'center', fontSize: 20, fontWeight: '900', color: '#30212B', marginTop: 5 },
  photoLine: { flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'flex-end' },
  photo: { width: 90, height: 120, borderWidth: 1, borderColor: '#CDBBC4', backgroundColor: '#F7F1F4' },
  photoEmpty: { width: 90, height: 120, borderWidth: 1, borderColor: '#CDBBC4', justifyContent: 'center', alignItems: 'center' },
  photoPlaceholder: { color: '#8A7D86', fontWeight: '700' },
  photoHint: { flex: 1, color: '#645963', fontSize: 12, lineHeight: 18 },
  date: { color: '#60535C', textAlign: 'right', fontSize: 12 },
  detail: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#D8C9D0', paddingVertical: 7, gap: 8 },
  detailLabel: { width: 68, color: '#5B4E56', fontSize: 13, fontWeight: '700' },
  detailText: { flex: 1, color: '#32232C', fontSize: 15, lineHeight: 22 },
  section: { gap: 5 },
  sectionTitle: { fontWeight: '800', color: '#4B3441', fontSize: 15, backgroundColor: '#FFF3F7', padding: 7 },
  historyRow: { flexDirection: 'row', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#E8DDE2', paddingVertical: 5 },
  dateCell: { width: 74, color: '#5B4E56', fontSize: 12 },
  body: { flex: 1, color: '#30212B', fontSize: 14, lineHeight: 21 },
  centerText: { textAlign: 'center' },
  rightText: { textAlign: 'right' },
});
