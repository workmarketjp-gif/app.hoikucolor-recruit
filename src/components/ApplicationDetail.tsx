import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApplicationMessages } from './ApplicationMessages';
import { Icon } from './Icon';
import {
  getJobseekerApplicationDetail,
  type JobseekerApplicationDetail,
  type JobseekerInterview,
  type JobseekerVisit,
} from '../lib/recruitRepository';
import './ApplicationDetail.css';

type Props = {
  applicationId: string;
  onBack: () => void;
};

const steps = [
  { key: 'new', label: '応募' },
  { key: 'reviewing', label: '書類確認' },
  { key: 'interview', label: '面接' },
  { key: 'offered', label: '内定' },
  { key: 'hired', label: '採用' },
] as const;

const statusOrder: Record<string, number> = {
  new: 0,
  applied: 0,
  reviewing: 1,
  screening: 1,
  review: 1,
  interview: 2,
  offered: 3,
  offer: 3,
  hired: 4,
};

export function ApplicationDetail({ applicationId, onBack }: Props) {
  const [detail, setDetail] = useState<JobseekerApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await getJobseekerApplicationDetail(applicationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '応募情報を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <section className="application-detail-state" aria-live="polite"><span className="loading-ring" /><strong>応募情報を読み込んでいます</strong></section>;
  }

  if (error) {
    return <section className="application-detail-state is-error"><strong>応募情報を読み込めませんでした</strong><p>{error}</p><div><button className="secondary-button" type="button" onClick={onBack}>応募一覧へ戻る</button><button className="primary-button" type="button" onClick={() => void load()}>再読み込み</button></div></section>;
  }

  if (!detail) {
    return <section className="application-detail-state"><strong>応募情報を確認できません</strong><p>この応募は存在しないか、現在のアカウントでは閲覧できません。</p><button className="primary-button" type="button" onClick={onBack}>応募一覧へ戻る</button></section>;
  }

  return <ApplicationDetailBody detail={detail} onBack={onBack} onRefresh={load} />;
}

function ApplicationDetailBody({ detail, onBack, onRefresh }: { detail: JobseekerApplicationDetail; onBack: () => void; onRefresh: () => Promise<void> }) {
  const { application, interviews, visits } = detail;
  const currentStep = statusOrder[application.status] ?? 0;
  const terminal = application.status === 'rejected' || application.status === 'withdrawn';
  const upcomingInterview = useMemo(() => interviews.find((item) => item.status === 'scheduled') || null, [interviews]);

  return <>
    <header className="application-detail-heading">
      <button className="application-back" type="button" onClick={onBack}><span aria-hidden="true">←</span> 応募一覧へ</button>
      <button className="secondary-button application-refresh" type="button" onClick={() => void onRefresh()}>更新</button>
    </header>

    <section className="application-detail-hero">
      <div>
        <span className={`status-badge status-${application.status}`}>{statusLabel(application.status)}</span>
        <h1>{application.job_title || '求人'}</h1>
        <p className="application-facility">{application.facility_name}</p>
        <div className="application-meta">
          {(application.prefecture || application.city) && <span><Icon name="map" size={14} /> {application.prefecture || ''} {application.city || ''}</span>}
          {application.employment_type && <span><Icon name="briefcase" size={14} /> {application.employment_type}</span>}
          <span><Icon name="clock" size={14} /> 応募日 {formatDate(application.applied_at)}</span>
        </div>
      </div>
      {upcomingInterview && <div className="next-action-card"><span>NEXT</span><strong>次回の面接</strong><p>{formatDateTime(upcomingInterview.scheduled_at)}</p>{upcomingInterview.location && <small>{upcomingInterview.location}</small>}</div>}
    </section>

    <section className={`selection-timeline ${terminal ? 'is-terminal' : ''}`} aria-label="選考状況">
      {steps.map((step, index) => {
        const complete = !terminal && index <= currentStep;
        return <div className={`selection-step ${complete ? 'is-complete' : ''}`} key={step.key}><span>{complete ? '✓' : index + 1}</span><strong>{step.label}</strong></div>;
      })}
      {terminal && <div className="selection-terminal"><strong>{statusLabel(application.status)}</strong><span>{application.status === 'withdrawn' ? '応募を辞退しました。' : '今回の選考は終了しました。'}</span></div>}
    </section>

    <div className="application-detail-grid">
      <section className="application-detail-card">
        <div className="application-card-head"><div><span className="eyebrow">APPLICATION</span><h2>応募内容</h2></div></div>
        <dl className="application-facts">
          <div><dt>応募日</dt><dd>{formatDate(application.applied_at)}</dd></div>
          <div><dt>入職希望日</dt><dd>{application.desired_start_date ? formatDateOnly(application.desired_start_date) : '未設定'}</dd></div>
          <div className="is-wide"><dt>応募時のメッセージ</dt><dd>{application.message?.trim() || 'メッセージはありません。'}</dd></div>
        </dl>
      </section>

      <section className="application-detail-card">
        <div className="application-card-head"><div><span className="eyebrow">INTERVIEW</span><h2>面接予定</h2></div><span className="application-count">{interviews.length}件</span></div>
        {interviews.length ? <div className="application-event-list">{interviews.map((interview) => <InterviewCard interview={interview} key={interview.id} />)}</div> : <p className="application-empty-copy">面接予定はまだ登録されていません。日程が決まるとここに表示されます。</p>}
      </section>

      <section className="application-detail-card">
        <div className="application-card-head"><div><span className="eyebrow">VISIT & TRIAL</span><h2>見学・体験</h2></div><span className="application-count">{visits.length}件</span></div>
        {visits.length ? <div className="application-event-list">{visits.map((visit) => <VisitCard visit={visit} key={visit.id} />)}</div> : <p className="application-empty-copy">この求人に関連する見学・体験予約はありません。</p>}
      </section>

      <section className="application-detail-card application-communication-card">
        <div className="application-card-head"><div><span className="eyebrow">COMMUNICATION</span><h2>園とのやり取り・提出書類</h2></div></div>
        <p className="application-card-intro">メッセージの確認、履歴書・保育士証などの提出をこの応募ごとに管理できます。</p>
        <ApplicationMessages applicationId={application.id} />
      </section>
    </div>
  </>;
}

function InterviewCard({ interview }: { interview: JobseekerInterview }) {
  const meetingUrl = safeHttpUrl(interview.meeting_url);
  return <article className="application-event">
    <div className="application-event-icon"><Icon name="clock" size={17} /></div>
    <div className="application-event-main"><strong>{formatDateTime(interview.scheduled_at)}</strong><span>{interview.duration_minutes}分 ・ {interviewStatusLabel(interview.status)}</span>{interview.location && <small><Icon name="map" size={12} /> {interview.location}</small>}</div>
    {meetingUrl && <a className="secondary-button" href={meetingUrl} target="_blank" rel="noreferrer">オンライン面接 <Icon name="external" size={13} /></a>}
  </article>;
}

function VisitCard({ visit }: { visit: JobseekerVisit }) {
  return <article className="application-event">
    <div className="application-event-icon"><Icon name="sparkles" size={17} /></div>
    <div className="application-event-main"><strong>{experienceLabel(visit.experience_type)} ・ {formatDateTime(visit.starts_at)}</strong><span>{visitStatusLabel(visit.status)} ・ {formatDuration(visit.starts_at, visit.ends_at)}</span>{visit.candidate_message && <small>{visit.candidate_message}</small>}</div>
  </article>;
}

function safeHttpUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function formatDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatDuration(startValue: string, endValue: string) {
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '';
  const minutes = Math.round((end - start) / 60_000);
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}時間${remainder}分` : `${hours}時間`;
}

function statusLabel(status: string) {
  return ({ new: '応募済み', applied: '応募済み', reviewing: '書類確認中', screening: '書類確認中', review: '確認中', interview: '面接予定', offered: '内定', offer: '内定', hired: '採用', rejected: '選考終了', withdrawn: '辞退' } as Record<string, string>)[status] || status;
}

function interviewStatusLabel(status: string) {
  return ({ scheduled: '予定', completed: '完了', cancelled: 'キャンセル', no_show: '未実施' } as Record<string, string>)[status] || status;
}

function experienceLabel(type: JobseekerVisit['experience_type']) {
  return ({ visit: '園見学', half_day_trial: '半日体験', full_day_trial: '1日体験' } as Record<JobseekerVisit['experience_type'], string>)[type];
}

function visitStatusLabel(status: string) {
  return ({ requested: '確認中', confirmed: '確定', declined: '日程調整不可', cancelled: 'キャンセル', completed: '参加済み', no_show: '未参加' } as Record<string, string>)[status] || status;
}
