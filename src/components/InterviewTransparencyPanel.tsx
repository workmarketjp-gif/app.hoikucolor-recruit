import { useEffect, useMemo, useState } from 'react';
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
        setError(err instanceof Error ? err.message : '働き方情報を読み込めませんでした。');
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
        verifiedUnavailableLabel: 'HO実績指標は未提供',
      },
      {
        label: '休憩',
        facilityValue: normalized(claims.break_time) || findFaqAnswer(faqs, ['休憩']),
        verifiedMetric: null,
        verifiedUnavailableLabel: 'HO実績指標は未提供',
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
        verifiedUnavailableLabel: 'HO実績指標は未提供',
      },
      {
        label: 'ブランク・経験',
        facilityValue: normalized(claims.experience_requirement) || findFaqAnswer(faqs, ['ブランク']),
        verifiedMetric: null,
        verifiedUnavailableLabel: 'HO実績指標は未提供',
      },
    ];
  }, [transparency, verified]);

  const faqRows = useMemo(() => sensitiveFaqs(transparency?.published_faqs || []).slice(0, 8), [transparency]);
  const hasFacilityData = rows.some((row) => row.facilityValue) || faqRows.length > 0;
  const hasVerifiedData = rows.some((row) => row.verifiedMetric);

  if (loading) return <section className="interview-transparency is-loading">面接前に確認したい情報を読み込んでいます…</section>;
  if (error) return <section className="interview-transparency is-error"><strong>面接前チェック</strong><span>{error}</span></section>;
  if (!hasFacilityData && !hasVerifiedData) return null;

  return <section className="interview-transparency" aria-label="面接で聞きづらい項目">
    <div className="interview-transparency-head">
      <div><span>BEFORE INTERVIEW</span><strong>面接で聞きづらいことを、応募前に確認</strong></div>
      <p>園の公開回答とHoiku Officeの実績値は、別の情報源として並べています。</p>
    </div>

    <div className="interview-source-legend" aria-label="情報源">
      <span className="facility-source">園の公開回答（申告）</span>
      <span className="verified-source">HO Verified（実績）</span>
    </div>

    <div className="interview-comparison" role="table" aria-label="園申告とHoiku Office実績の比較">
      <div className="interview-comparison-row is-head" role="row">
        <strong role="columnheader">確認項目</strong>
        <strong role="columnheader">園の公開回答（申告）</strong>
        <strong role="columnheader">HO Verified（実績）</strong>
      </div>
      {rows.map((row) => <div className="interview-comparison-row" role="row" key={row.label}>
        <strong role="rowheader">{row.label}</strong>
        <div role="cell" className={row.facilityValue ? '' : 'is-missing'}>{row.facilityValue || '公開回答なし'}</div>
        <div role="cell" className={row.verifiedMetric ? 'verified-value' : 'is-missing'}>
          {row.verifiedMetric ? <><strong>{formatMetric(row.verifiedMetric)}</strong><small>実績 n={row.verifiedMetric.sample_size}</small></> : (row.verifiedUnavailableLabel || '実績未公開')}
        </div>
      </div>)}
    </div>

    {faqRows.length > 0 && <div className="interview-faqs">
      <div className="interview-faqs-head"><strong>園が先に答えている質問</strong><span>園の公開Q&A</span></div>
      {faqRows.map((faq) => <details key={`${faq.question}-${faq.answer}`}>
        <summary>{faq.question}</summary>
        <p>{faq.answer}</p>
      </details>)}
    </div>}

    <p className="interview-transparency-note">
      「園の公開回答」は園が公開した申告情報です。「HO Verified」はHoiku Officeの運用実績から自動集計された値です。公開されていない値を別ソースで補完したり、推測値として表示したりしません。
    </p>
  </section>;
}
