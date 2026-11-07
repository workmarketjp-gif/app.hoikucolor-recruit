import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SavedJobseekerJob } from '../lib/jobseekerCoreApi';
import { presentSavedJobCard } from '../lib/savedJobCardPresentation';
import { verifiedEvidence, type VerifiedEvidenceDisplay } from '../lib/jobVerifiedEvidence';

type Props = {
  job: SavedJobseekerJob;
  disabled: boolean;
  removing: boolean;
  onOpen: () => void;
  onVisit: () => void;
  onRemove: () => void;
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.body}>{value}</Text></View>;
}
function Evidence({ title, evidence }: { title: string; evidence: VerifiedEvidenceDisplay }) {
  return <View style={styles.evidence}>
    <Text style={styles.section}>✓ {title}</Text>
    {evidence.transparencyPercent !== null ? <Text style={styles.muted}>情報公開率 {evidence.transparencyPercent}%</Text> : null}
    {evidence.metrics.map((item) => <View key={item.key} style={styles.field}>
      <Text style={styles.fieldLabel}>{item.label}</Text>
      <Text style={styles.value}>{item.value}</Text>
      {item.recordCount !== null ? <Text style={styles.muted}>{item.recordCount}件の記録</Text> : null}
    </View>)}
    {evidence.period ? <Text style={styles.muted}>集計期間 {evidence.period}</Text> : null}
  </View>;
}

/** Web SavedView JobCard parity with actual candidate-owned server rows. */
export function SavedJobPreviewCard({ job, disabled, removing, onOpen, onVisit, onRemove }: Props) {
  const [expanded, setExpanded] = useState(false);
  const info = presentSavedJobCard(job, Date.now());
  const workplace = verifiedEvidence(job.verified_workplace, 'workplace');
  const finance = verifiedEvidence(job.verified_finance, 'finance');
  return <View style={styles.card} testID={'saved-job-' + job.id}>
    <View style={styles.heading}>
      <View style={styles.headingText}><Text style={styles.facility}>{job.facility_name}</Text><Text style={styles.title}>{job.title}</Text></View>
      <Text accessibilityLabel="気になるに保存済み" style={styles.heart}>♥</Text>
    </View>
    <Text style={styles.salary}>{info.salary}</Text>
    <Text style={styles.meta}>{info.location}{info.employmentType ? ' ・ ' + info.employmentType : ''}</Text>
    <View style={styles.badges}>
      {info.closed ? <Text style={styles.closed}>募集終了</Text> : null}
      {info.hasWorkplaceEvidence && workplace ? <Text style={styles.badge}>✓ 勤務実績あり</Text> : null}
      {info.hasFinanceEvidence && finance ? <Text style={styles.badge}>✓ 会計実績あり</Text> : null}
    </View>
    {expanded ? <View style={styles.detail} testID={'saved-job-details-' + job.id}>
      <Text style={styles.section}>園</Text>
      <Text style={styles.body}>{job.facility_name}{job.facility_type ? '（' + job.facility_type + '）' : ''}</Text>
      <Text style={styles.body}>{job.address || info.location}</Text>
      <Text style={styles.section}>条件</Text>
      <Field label="給与" value={info.salary} />
      <Field label="雇用形態" value={info.employmentType} />
      <Field label="勤務時間" value={job.working_hours} />
      <Field label="休日" value={job.holidays} />
      <Field label="応募資格" value={job.required_qualification} />
      <Field label="待遇" value={job.benefits} />
      <Field label="募集人数" value={Number.isSafeInteger(job.number_of_positions) && job.number_of_positions >= 0 ? job.number_of_positions + '名' : '未掲載'} />
      {workplace || finance ? <Text style={styles.section}>実際の働き方</Text> : null}
      {workplace ? <Evidence title="勤務実績" evidence={workplace} /> : null}
      {finance ? <Evidence title="会計実績" evidence={finance} /> : null}
      <Text style={styles.section}>仕事内容・保育観</Text>
      <Text style={styles.body}>{job.description || '未掲載'}</Text>
      {info.closed ? <Text style={styles.notice}>募集は終了しています。保存履歴として求人内容を確認できます。</Text> : null}
      {job.is_external && job.source_name ? <Text style={styles.muted}>出典：{job.source_name}</Text> : null}
      {info.directApply ? <Pressable accessibilityRole="button" disabled={disabled} onPress={onVisit} style={styles.visit}><Text style={styles.visitText}>見学・体験を予約</Text></Pressable> : null}
    </View> : null}
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded, disabled }} disabled={disabled} style={styles.outline} onPress={() => setExpanded((value) => !value)}><Text style={styles.outlineText}>{expanded ? '閉じる' : '詳しく見る'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={disabled} style={styles.primary} onPress={onOpen}><Text style={styles.primaryText}>{info.directApply ? '詳細・応募を見る' : '求人の詳細を見る'}</Text></Pressable>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={job.facility_name + 'を気になるから外す'} disabled={disabled} style={styles.remove} onPress={onRemove}>
      {removing ? <ActivityIndicator color="#AC2853" /> : <Text style={styles.removeText}>気になるから外す</Text>}
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#F5DCE4', borderRadius: 18, padding: 17, gap: 10 },
  heading: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  headingText: { flex: 1, gap: 5 },
  facility: { color: '#7C475E', fontSize: 14, fontWeight: '700' },
  title: { fontSize: 19, fontWeight: '900', lineHeight: 27, color: '#30212B' },
  heart: { fontSize: 23, color: '#E9265A' },
  salary: { fontWeight: '900', fontSize: 18, color: '#30212B' },
  meta: { color: '#615B66', fontSize: 14, lineHeight: 21 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  badge: { color: '#9F2048', backgroundColor: '#FFF0F4', fontWeight: '800', fontSize: 12, padding: 7, borderRadius: 8 },
  closed: { color: '#A82931', backgroundColor: '#FFF0F0', fontWeight: '800', fontSize: 13, padding: 7, borderRadius: 8 },
  detail: { gap: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#F5DCE4' },
  section: { fontSize: 17, fontWeight: '900', paddingTop: 8, color: '#34232C' },
  field: { gap: 4 },
  fieldLabel: { color: '#66616B', fontSize: 13, fontWeight: '700' },
  body: { color: '#39353B', fontSize: 15, lineHeight: 23 },
  value: { fontSize: 17, fontWeight: '800', color: '#30212B' },
  muted: { color: '#6A6570', fontSize: 13, lineHeight: 19 },
  notice: { color: '#A82931', fontSize: 14, lineHeight: 22 },
  evidence: { backgroundColor: '#FFF8FA', borderWidth: 1, borderColor: '#F5DCE4', borderRadius: 12, gap: 6, padding: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  outline: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderColor: '#E5D1DB', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8 },
  outlineText: { fontSize: 14, fontWeight: '800', color: '#49333F' },
  primary: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9265A', borderRadius: 12, paddingHorizontal: 8 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  remove: { minHeight: 46, borderWidth: 1, borderColor: '#EBC6D2', alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  removeText: { color: '#A32650', fontWeight: '800', fontSize: 14 },
  visit: { minHeight: 48, borderWidth: 1, borderRadius: 12, borderColor: '#E9265A', alignItems: 'center', justifyContent: 'center' },
  visitText: { color: '#B72552', fontSize: 15, fontWeight: '800' },
});
