import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { getJobseekerProfile, listRankedJobs, type JobseekerJob, type JobseekerProfile } from '../lib/jobseekerCoreApi';
import { getJobseekerMatchingPreferences, type JobseekerMatchingPreferences } from '../lib/candidateParityApi';
import { matchJob, type JobMatchResult } from '../lib/jobMatching';

type ComparedJob = { job: JobseekerJob; match: JobMatchResult };
type ComparisonSource = 'facility' | 'workplace' | 'finance' | 'match';

const maxComparedJobs = 3;
const workplacePriority = [
  'average_monthly_overtime_hours',
  'paid_leave_usage_rate_pct',
  'average_tenure_years',
  'average_monthly_saturday_shift_count',
  'average_monthly_early_shift_count',
  'average_monthly_late_shift_count',
  'nursery_teacher_ratio_pct',
  'full_time_ratio_pct',
];
const financePriority = [
  'finance_monthly_result_stability',
  'finance_budget_managed_months_12m',
  'finance_payroll_finalized_months_12m',
  'finance_closed_months_12m',
  'finance_close_within_45_days_pct',
  'finance_positive_month_ratio_pct',
  'finance_average_result_margin_pct',
];

function salary(job: JobseekerJob) {
  const min = job.salary_min == null ? null : job.salary_min.toLocaleString('ja-JP');
  const max = job.salary_max == null ? null : job.salary_max.toLocaleString('ja-JP');
  const prefix = job.salary_type === 'hourly' ? '時給' : job.salary_type === 'annual' ? '年収' : '月給';
  if (min && max) return min === max ? `${prefix} ${min}円` : `${prefix} ${min}〜${max}円`;
  if (min) return `${prefix} ${min}円〜`;
  if (max) return `${prefix} 〜${max}円`;
  return job.salary_note || '未掲載';
}

function explicitTextSignal(job: JobseekerJob, phrases: string[], positiveLabel: string) {
  const text = [job.description, job.working_hours, job.holidays, job.benefits].filter(Boolean).join('');
  return phrases.some((phrase) => text.includes(phrase)) ? positiveLabel : '求人情報に明記なし';
}

function metricLabel(compared: ComparedJob[], kind: 'workplace' | 'finance', key: string) {
  for (const { job } of compared) {
    const metric = kind === 'workplace'
      ? job.verified_workplace?.verified_metrics?.[key]
      : job.verified_finance?.verified_metrics?.[key];
    if (metric?.label) return metric.label;
  }
  const fallback: Record<string, string> = {
    average_monthly_overtime_hours: '平均時間外労働',
    paid_leave_usage_rate_pct: '有休取得率',
    average_tenure_years: '平均勤続年数',
    average_monthly_saturday_shift_count: '平均土曜勤務回数',
    average_monthly_early_shift_count: '平均早番回数',
    average_monthly_late_shift_count: '平均遅番回数',
    nursery_teacher_ratio_pct: '保育士比率',
    full_time_ratio_pct: '常勤比率',
    finance_monthly_result_stability: '月次収支安定性',
    finance_budget_managed_months_12m: '予算管理実績',
    finance_payroll_finalized_months_12m: '給与確定実績',
    finance_closed_months_12m: '月次締め実績',
    finance_close_within_45_days_pct: '45日以内締め率',
    finance_positive_month_ratio_pct: '黒字月比率',
    finance_average_result_margin_pct: '平均収支率',
  };
  return fallback[key] || key;
}

function metricValue(job: JobseekerJob, kind: 'workplace' | 'finance', key: string) {
  const metric = kind === 'workplace'
    ? job.verified_workplace?.verified_metrics?.[key]
    : job.verified_finance?.verified_metrics?.[key];
  if (!metric || metric.value === null || metric.value === undefined) return '実績未公開';
  const value = typeof metric.value === 'number' ? Number(metric.value.toFixed(1)) : metric.value;
  return `${value}${metric.unit || ''}`;
}

function sourceLabel(source: ComparisonSource) {
  if (source === 'workplace') return '勤務実績';
  if (source === 'finance') return '会計実績';
  if (source === 'match') return 'マッチング';
  return '園掲載';
}

function ComparisonRow({
  label,
  source,
  values,
}: {
  label: string;
  source: ComparisonSource;
  values: string[];
}) {
  return (
    <View style={styles.compareRow}>
      <View style={styles.compareLabel}>
        <Text style={styles.sourceBadge}>{sourceLabel(source)}</Text>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      {values.map((value, index) => (
        <View key={`${label}-${index}`} style={styles.valueCell}>
          <Text style={[styles.valueText, value.includes('未公開') || value.includes('未掲載') || value.includes('明記なし') ? styles.missing : null]}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function CompareScreen() {
  const { pinCandidateAction } = usePinnedCandidateAction();
  const [jobs, setJobs] = useState<JobseekerJob[]>([]);
  const [profile, setProfile] = useState<JobseekerProfile | null>(null);
  const [preferences, setPreferences] = useState<JobseekerMatchingPreferences | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('安全なログイン状態を確認できませんでした。');
      const [nextJobs, nextProfile, nextPreferences] = await Promise.all([
        listRankedJobs(pinned.client),
        getJobseekerProfile(pinned.client),
        getJobseekerMatchingPreferences(pinned.client),
      ]);
      if (!pinned.isCurrent() || current !== generation.current) return;
      setJobs(nextJobs);
      setProfile(nextProfile);
      setPreferences(nextPreferences);
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

  const compared = useMemo<ComparedJob[]>(() => {
    if (!preferences) return [];
    const byId = new Map(jobs.map((job) => [job.id, job]));
    return selectedIds.flatMap((id) => {
      const job = byId.get(id);
      return job ? [{ job, match: matchJob({ job, profile, preferences }) }] : [];
    });
  }, [jobs, preferences, profile, selectedIds]);

  const toggleJob = (jobId: string) => {
    setSelectedIds((current) => {
      if (current.includes(jobId)) return current.filter((id) => id !== jobId);
      if (current.length >= maxComparedJobs) {
        setError('比較できる求人は3件までです。');
        return current;
      }
      setError(null);
      return [...current, jobId];
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.page} horizontal={false}>
      <View>
        <Text style={styles.title}>園を比較</Text>
        <Text style={styles.bodyMuted}>最大3件を並べて比較できます。</Text>
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendText}>園掲載：求人票・園が公開した情報</Text>
        <Text style={styles.legendText}>勤務実績：実際の勤務記録から集計</Text>
        <Text style={styles.legendText}>会計実績：確定した会計記録から集計</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator /> : null}

      {!loading ? (
        <View style={styles.card}>
          <View style={styles.headingRow}>
            <Text style={styles.sectionTitle}>比較する求人</Text>
            <Text style={styles.count}>{selectedIds.length}/{maxComparedJobs}件</Text>
          </View>
          {jobs.length === 0 ? <Text style={styles.bodyMuted}>現在比較できる公開求人がありません。</Text> : null}
          {jobs.map((job) => {
            const selected = selectedIds.includes(job.id);
            const disabled = !selected && selectedIds.length >= maxComparedJobs;
            return (
              <Pressable
                key={job.id}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                style={[styles.pick, selected && styles.pickSelected, disabled && styles.pickDisabled]}
                onPress={() => toggleJob(job.id)}
              >
                <Text style={styles.pickMark}>{selected ? '✓' : '+'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickTitle}>{job.facility_name}</Text>
                  <Text style={styles.bodyMuted}>{job.title}</Text>
                  <Text style={styles.meta}>{[job.prefecture, job.city].filter(Boolean).join(' ') || '地域未設定'}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!loading && compared.length < 2 ? (
        <Text style={styles.notice}>2件以上選ぶと比較表が出ます。</Text>
      ) : null}

      {compared.length >= 2 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.table}>
          <View>
            <View style={styles.compareHeader}>
              <View style={styles.compareLabel}><Text style={styles.rowLabel}>比較項目</Text></View>
              {compared.map(({ job }) => (
                <View key={job.id} style={styles.valueCell}>
                  <Text style={styles.headerFacility}>{job.facility_name}</Text>
                  <Text style={styles.headerJob}>{job.title}</Text>
                  <Pressable style={styles.removeButton} onPress={() => toggleJob(job.id)}>
                    <Text style={styles.removeText}>外す</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            <ComparisonRow label="希望条件マッチ" source="match" values={compared.map(({ match }) => match.condition_score === null ? '希望条件未設定' : `${match.condition_score}%`)} />
            <ComparisonRow label="保育観サイン" source="match" values={compared.map(({ match }) => match.matched_childcare_values.length ? match.matched_childcare_values.join('・') : '明示的な一致サインなし')} />
            <ComparisonRow label="勤務地" source="facility" values={compared.map(({ job }) => [job.prefecture, job.city, job.address].filter(Boolean).join(' ') || '未掲載')} />
            <ComparisonRow label="雇用形態" source="facility" values={compared.map(({ job }) => job.employment_type || '未掲載')} />
            <ComparisonRow label="給与" source="facility" values={compared.map(({ job }) => salary(job))} />
            <ComparisonRow label="勤務時間" source="facility" values={compared.map(({ job }) => job.working_hours || '未掲載')} />
            <ComparisonRow label="休日" source="facility" values={compared.map(({ job }) => job.holidays || '未掲載')} />
            <ComparisonRow label="応募資格" source="facility" values={compared.map(({ job }) => job.required_qualification || '未掲載')} />
            <ComparisonRow label="持ち帰り" source="facility" values={compared.map(({ job }) => explicitTextSignal(job, ['持ち帰りなし', '持ち帰り仕事なし', '持ち帰り業務なし'], '持ち帰りなしと明記'))} />
            <ComparisonRow label="配置・人員体制" source="facility" values={compared.map(({ job }) => explicitTextSignal(job, ['基準以上の配置', '手厚い配置', '配置に余裕', 'ゆとりある配置'], '手厚い配置の記載あり'))} />
            <ComparisonRow label="福利厚生・制度" source="facility" values={compared.map(({ job }) => job.benefits || '未掲載')} />

            {workplacePriority.map((key) => (
              <ComparisonRow
                key={key}
                label={metricLabel(compared, 'workplace', key)}
                source="workplace"
                values={compared.map(({ job }) => metricValue(job, 'workplace', key))}
              />
            ))}
            {financePriority.map((key) => (
              <ComparisonRow
                key={key}
                label={metricLabel(compared, 'finance', key)}
                source="finance"
                values={compared.map(({ job }) => metricValue(job, 'finance', key))}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}

      {compared.length >= 2 ? (
        <Text style={styles.bodyMuted}>勤務実績・会計実績は、確定した記録から取得できた項目だけを表示します。未取得は「実績未公開」とし、園の掲載値で補完しません。</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, backgroundColor: '#f7f8fa', flexGrow: 1 },
  title: { fontSize: 26, fontWeight: '900' },
  bodyMuted: { fontSize: 15, lineHeight: 22, color: '#606873' },
  meta: { fontSize: 14, color: '#7a818b' },
  legend: { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 4 },
  legendText: { fontSize: 14, lineHeight: 20, color: '#4a4f59' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 20, fontWeight: '900' },
  count: { fontSize: 14, color: '#606873', fontWeight: '800' },
  pick: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, padding: 12 },
  pickSelected: { borderColor: '#e8445a', backgroundColor: '#fff0f3' },
  pickDisabled: { opacity: 0.45 },
  pickMark: { width: 26, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  pickTitle: { fontSize: 16, fontWeight: '900' },
  notice: { fontSize: 15, backgroundColor: '#fff8e6', padding: 12, borderRadius: 10 },
  table: { paddingBottom: 4 },
  compareHeader: { flexDirection: 'row', backgroundColor: '#fff', borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  compareRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e6e8ec', backgroundColor: '#fff' },
  compareLabel: { width: 150, padding: 12, gap: 5, justifyContent: 'center' },
  valueCell: { width: 190, padding: 12, gap: 6, justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: '#e6e8ec' },
  sourceBadge: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '800', backgroundColor: '#f2f4f7', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4, overflow: 'hidden' },
  rowLabel: { fontSize: 15, fontWeight: '900' },
  valueText: { fontSize: 15, lineHeight: 21 },
  missing: { color: '#8a909b' },
  headerFacility: { fontSize: 15, fontWeight: '900' },
  headerJob: { fontSize: 14, color: '#606873' },
  removeButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#d7dce2', borderRadius: 10 },
  removeText: { fontSize: 14, fontWeight: '800' },
  error: { fontSize: 15, color: '#b42318', backgroundColor: '#fff1f0', padding: 12, borderRadius: 10 },
});
