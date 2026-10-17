import { useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../lib/useResource';
import {
  getJobTransparency,
  getPublicWorkplaceProfile,
  type JobTransparency,
  type PublishedRecruitmentFaq,
} from '../lib/jobTransparencyRepository';
import type { VerifiedWorkplaceMetric, VerifiedWorkplaceProfile } from '../lib/recruitRepository';
import './InterviewTransparencyPanel.css';

type TransparencyRow = {
  label: string;
  facilityValue: string | null;
  verifiedMetric: VerifiedWorkplaceMetric | null;
  verifiedUnavailableLabel?: string;
};

const sensitiveFaqKeywords = [
  '残業', '持ち帰り', '有休', '有給', '休憩', '急な休', '子育て', '人間関係', '園長', '主任',
  '書類', '行事', '配置', '宿舎', '処遇改善', 'ピアノ', 'ブランク', '勤務時間', '休み',
];

function normalized(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function findFaqAnswer(faqs: PublishedRecruitmentFaq[], keywords: string[]) {
  const row = faqs.find((faq) => keywords.some((keyword) => `${faq.question} ${faq.answer}`.includes(keyword)));
  return row?.answer?.trim() || null;
}

function metric(profile: VerifiedWorkplaceProfile | null, key: string) {
  const value = profile?.verified_metrics?.[key];
  return value?.value !== null && value?.value !== undefined ? value : null;
}

function formatMetric(value: VerifiedWorkplaceMetric) {
  const amount = typeof value.value === 'number' ? Number(value.value.toFixed(1)) : value.value;
  return `${amount}${value.unit || ''}`;
}

function sensitiveFaqs(faqs: PublishedRecruitmentFaq[]) {
  return faqs.filter((faq) => sensitiveFaqKeywords.some((keyword) => `${faq.question} ${faq.answer}`.includes(keyword)));
}

export function InterviewTransparencyPanel({ jobId, facilityId }: { jobId: string; facilityId: string }) {
  const [transparency, setTransparency] = useState<JobTransparency | null>(null);
  const [verified, setVerified] = useState<VerifiedWorkplaceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getJobTransparency(jobId), getPublicWorkplaceProfile(facilityId)])
      .then(([transparencyRow, verifiedRow]) => {
        if (!active) return;
        setTransparency(transparencyRow);
        setVerified(verifiedRow);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(errorMessage(err, '働き方情報を読み込めませんでした。'));
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [facilityId, jobId]);

  const rows = useMemo<TransparencyRow[]>(() => {
    const claims = transparency?.facility_claims || {};
    const faqs = transparency?.published_faqs || [];
    return [
      {
        label: '残業',
        facilityValue: normalized(claims.overtime) || findFaqAnswer(faqs, ['残業']),
        verifiedMetric: metric(verified, 'average_monthly_overtime_hours'),
      },
      {
        label: '持ち帰り仕事',
        facilityValue: normalized(claims.take_home_work) || findFaqAnswer(faqs, ['持ち帰り']),
        verifiedMetric: null,
        verifiedUnavailableLabel: '勤務実績なし',
      },
      {
        label: '休憩',
        facilityValue: normalized(claims.break_time) || findFaqAnswer(faqs, ['休憩']),
        verifiedMetric: null,
        verifiedUnavailableLabel: '勤務実績なし',
      },
      {
        label: '有休取得',
        facilityValue: findFaqAnswer(faqs, ['有休', '有給']),
        verifiedMetric: metric(verified, 'paid_leave_usage_rate_pct'),
      },
      {
        label: '年間休日',
        facilityValue: normalized(claims.annual_holidays),
        verifiedMetric: null,
        verifiedUnavailableLabel: '勤務実績なし',
      },
      {
        label: 'ブランク・経験',
        facilityValue: normalized(claims.experience_requirement) || findFaqAnswer(faqs, ['ブランク']),
        verifiedMetric: null,
        verifiedUnavailableLabel: '勤務実績なし',
      },
    ];
  }, [transparency, verified]);

  const faqRows = useMemo(() => sensitiveFaqs(transparency?.published_faqs || []).slice(0, 8), [transparency]);
  const hasFacilityData = rows.some((row) => row.facilityValue) || faqRows.length > 0;
  const hasVerifiedData = rows.some((row) => row.verifiedMetric);

  if (loading) return <section className="interview-transparency is-loading" aria-busy="true">面接前に確認したい情報を読み込んでいます…</section>;
  if (error) return <section className="interview-transparency is-error" role="alert"><strong>面接前に確認したい情報</strong><span>{error}</span></section>;
  if (!hasFacilityData && !hasVerifiedData) return null;

  // Each missing-value label is explained once, and only when it is actually shown.
  const verifiedLabel = (row: TransparencyRow) => row.verifiedUnavailableLabel || '実績未公開';
  const shownMissing = new Set(rows.filter((row) => !row.verifiedMetric).map(verifiedLabel));

  return <section className="interview-transparency" aria-labelledby={`interview-transparency-${jobId}`}>
    <h4 className="interview-transparency-title" id={`interview-transparency-${jobId}`}>面接で聞きづらいことを、応募前に確認</h4>
    <p className="interview-transparency-lead">
      「園の回答」は園が公開している回答（園の公開回答（申告））、「勤務実績」は実際の勤務記録から集計した値です。
    </p>

    <dl className="interview-checks">
      {rows.map((row) => <div className="interview-check" key={row.label}>
        <dt>{row.label}</dt>
        <dd className={row.facilityValue ? '' : 'is-missing'}>
          <span className="facility-source">園の回答</span>
          <span className="interview-check-value">{row.facilityValue || '公開回答なし'}</span>
        </dd>
        <dd className={row.verifiedMetric ? 'is-verified' : 'is-missing'}>
          <span className="verified-source">勤務実績</span>
          <span className="interview-check-value">
            {row.verifiedMetric
              ? <><strong>{formatMetric(row.verifiedMetric)}</strong> <small>{row.verifiedMetric.sample_size}件の記録から集計</small></>
              : verifiedLabel(row)}
          </span>
        </dd>
      </div>)}
    </dl>

    {shownMissing.size > 0 && <dl className="interview-missing-help">
      {shownMissing.has('実績未公開') && <div><dt>実績未公開</dt><dd>勤務記録から集計する項目ですが、この園の値はまだ公開されていません。</dd></div>}
      {shownMissing.has('勤務実績なし') && <div><dt>勤務実績なし</dt><dd>この項目は勤務記録から集計していないため、比べられる値がありません。</dd></div>}
    </dl>}

    {faqRows.length > 0 && <div className="interview-faqs">
      <h5 className="interview-faqs-title">園が先に答えている質問</h5>
      {faqRows.map((faq) => <details key={`${faq.question}-${faq.answer}`}>
        <summary>{faq.question}</summary>
        <p>{faq.answer}</p>
      </details>)}
    </div>}

    <p className="interview-transparency-note">
      「勤務実績」は実際の勤務記録から集計した値です。公開されていない値を推測で補うことはしません。
    </p>
  </section>;
}
