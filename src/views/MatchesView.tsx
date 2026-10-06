import { useMemo, useState } from 'react';
import { JobCard } from '../components/JobCard';
import { EmptyState, InlineError, SkeletonList } from '../components/StateViews';
import { compareMatchedJobs, matchJob, type JobMatchResult } from '../lib/jobMatching';
import { getJobseekerMatchingPreferences } from '../lib/profilePreferencesRepository';
import { getProfile, listJobs, type Job } from '../lib/recruitRepository';
import { useResource } from '../lib/useResource';

type RankedJob = { job: Job; match: JobMatchResult };

type Props = {
  userKey: string;
  savedIds: string[];
  onToggleSaved: (jobId: string) => void;
  onStartApplication: (jobId: string) => void;
  onApplied: (applicationId: string) => void;
};

/**
 * Jobs ordered by how well they fit the candidate's registered preferences. The score
 * only uses stated conditions; childcare values are a separate, explicit-text signal.
 */
export function MatchesView({ userKey, savedIds, onToggleSaved, onStartApplication, onApplied }: Props) {
  const data = useResource(
    `matches:${userKey}`,
    () => Promise.all([listJobs(), getProfile(), getJobseekerMatchingPreferences()]),
    'マッチング情報を読み込めませんでした。',
  );
  const [onlyStrong, setOnlyStrong] = useState(false);

  const ranked = useMemo<RankedJob[]>(() => {
    if (!data.data) return [];
    const [jobs, profile, preferences] = data.data;
    return jobs
      .map((job) => ({ job, match: matchJob({ job, profile, preferences }) }))
      .sort(compareMatchedJobs);
  }, [data.data]);

  const preferences = data.data?.[2] ?? null;
  const hasPreferences = ranked.some((item) => item.match.has_preferences) || Boolean(preferences && (
    preferences.childcare_values.length || preferences.work_preferences.length || preferences.desired_prefectures.length || preferences.desired_cities.length
  ));
  const visible = onlyStrong
    ? ranked.filter((item) => item.match.condition_score !== null && item.match.condition_score >= 70)
    : ranked;

  return (
    <div className="hc-view hc-matches">
      <p className="hc-lead">あなたの希望条件に合う順です。</p>
      <details className="hc-explain">
        <summary>点数の決め方</summary>
        <p>勤務地・雇用形態・給与などは通常ロジックで判定し、保育観は求人文面との一致サインを分けて表示します。条件マッチは登録した希望条件だけで計算します。HO/HF Verifiedは求人の実績確認と同点時の並び順に使い、園の申告値と混ぜません。保育観は現在、求人文面に明示された表現だけを参考サインとして表示します。氏名・メール・電話番号は点数に使いません。</p>
      </details>

      {data.status === 'error' && <InlineError message={data.error} onRetry={data.reload} />}
      {data.status === 'loading' && !data.data && <SkeletonList rows={3} />}
      {data.data && (
        <>
          {!hasPreferences && (
            <div className="hc-callout">
              <strong>希望条件と保育観を登録すると、おすすめ順が使えます。</strong>
              <a className="primary-button" href="/scouts#scout-settings">条件を登録する</a>
            </div>
          )}
          <div className="hc-result-bar">
            <strong aria-live="polite">{visible.length}件 <small>条件マッチ順</small></strong>
            <button type="button" className={`hc-chip ${onlyStrong ? 'is-active' : ''}`} aria-pressed={onlyStrong} onClick={() => setOnlyStrong((value) => !value)}>70%以上だけ表示</button>
          </div>
          {visible.length
            ? <div className="hc-job-list">{visible.map(({ job, match }) => (
                <JobCard key={job.id} job={job} saved={savedIds.includes(job.id)} onToggleSaved={onToggleSaved} onStartApplication={onStartApplication} onApplied={onApplied} expandLabel="根拠・詳細を見る">
                  <MatchEvidence match={match} />
                </JobCard>
              ))}</div>
            : <EmptyState
                title="表示できる求人がありません"
                body={ranked.length ? '「70%以上だけ表示」を解除すると、すべての求人を確認できます。' : '現在公開中の求人はありません。求人が公開されると条件に合わせて自動で並びます。'}
                action={onlyStrong ? 'すべて表示する' : undefined}
                onAction={onlyStrong ? () => setOnlyStrong(false) : undefined}
              />}
          <a className="hc-link-button hc-block-link" href="/scouts#scout-settings">希望条件を見直す</a>
        </>
      )}
    </div>
  );
}

function MatchEvidence({ match }: { match: JobMatchResult }) {
  const strong = match.condition_score !== null && match.condition_score >= 70;
  return (
    <div className="hc-match-evidence">
      <div className="hc-match-scores">
        <span className={`hc-match-score ${strong ? 'is-strong' : ''}`}><small>条件マッチ</small><strong>{match.condition_score === null ? '—' : `${match.condition_score}%`}</strong></span>
        <span className="hc-match-score"><small>保育観サイン</small><strong>{match.childcare_value_signal_pct === null ? '未設定' : `${match.matched_childcare_values.length}/${match.matched_childcare_values.length + match.unmatched_childcare_values.length}一致`}</strong></span>
      </div>
      {match.condition_reasons.length > 0 && <ul className="hc-match-reasons">{match.condition_reasons.slice(0, 3).map((reason) => <li key={reason}>✓ {reason}</li>)}</ul>}
      {match.condition_gaps.length > 0 && <p className="hc-match-gaps">確認したい点：{match.condition_gaps.slice(0, 2).join('・')}</p>}
      {match.unmatched_childcare_values.length > 0 && <p className="hc-match-gaps">「{match.unmatched_childcare_values.join('・')}」は求人文面だけでは確認できません（未一致ではなく情報不足）。</p>}
    </div>
  );
}
