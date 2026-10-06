import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { EmptyState, InlineError, SkeletonList } from '../components/StateViews';
import { getProfile, submitApplication } from '../lib/recruitRepository';
import { listMySpotAssignments, listSpotJobs, type SpotAssignment, type SpotJobListing } from '../lib/spotJobRepository';
import { errorMessage } from '../lib/useResource';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** One-day spot work: open slots to apply for, and the candidate's confirmed shifts. */
export function SpotJobsView({ onStartApplication }: { onStartApplication: () => void }) {
  const [jobs, setJobs] = useState<SpotJobListing[]>([]);
  const [assignments, setAssignments] = useState<SpotAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const handledAssignmentRef = useRef<string | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet && mountedRef.current) setLoading(true);
    try {
      const [nextJobs, nextAssignments] = await Promise.all([listSpotJobs(), listMySpotAssignments()]);
      if (!mountedRef.current) return;
      setJobs(nextJobs);
      setAssignments(nextAssignments);
      setLoaded(true);
      setError(null);
    } catch (err) {
      // A failed background refresh keeps the last good data; a failed visible read is an error state.
      if (!mountedRef.current || quiet) return;
      setError(errorMessage(err, 'スポット勤務を読み込めませんでした。'));
    } finally {
      if (mountedRef.current && !quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh(false);
    return () => { mountedRef.current = false; };
  }, [refresh]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    const intervalId = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('pageshow', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('hc:spot-refresh', refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('pageshow', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('hc:spot-refresh', refreshWhenVisible);
    };
  }, [refresh]);

  useEffect(() => {
    const assignmentId = new URLSearchParams(window.location.search).get('assignment_id');
    if (loading || !assignmentId || !UUID_PATTERN.test(assignmentId) || handledAssignmentRef.current === assignmentId) return;
    const ownedAssignment = assignments.find((item) => item.assignment_id === assignmentId);
    if (!ownedAssignment) return;
    const target = document.getElementById(`spot-assignment-${assignmentId}`);
    if (!target) return;
    handledAssignmentRef.current = assignmentId;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus({ preventScroll: true });
    });
  }, [assignments, loading]);

  const apply = async (job: SpotJobListing) => {
    setApplyingId(job.job_id);
    setApplyError(null);
    try {
      const profile = await getProfile();
      if (!profile?.name?.trim()) { onStartApplication(); return; }
      const applicationId = await submitApplication(job.job_id, profile);
      setJobs((current) => current.map((item) => item.job_id === job.job_id
        ? { ...item, application_id: applicationId, application_status: item.application_status || 'new' }
        : item));
      window.dispatchEvent(new CustomEvent('hc:applications-refresh'));
    } catch (err) {
      setApplyError(errorMessage(err, 'スポット勤務に応募できませんでした。'));
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="hc-view hc-spot">
      <p className="hc-lead">1日単位で働ける勤務です。通常求人とは分けて表示しています。</p>

      {error && <InlineError message={error} onRetry={() => void refresh(false)} />}
      {loading && !loaded && <SkeletonList rows={2} />}
      {applyError && <p className="form-error" role="alert">{applyError}</p>}

      {loaded && (
        <>
          {assignments.length > 0 && (
            <section className="hc-section" aria-labelledby="spot-assignment-heading">
              <div className="hc-section-head"><h2 id="spot-assignment-heading">あなたのスポット勤務</h2></div>
              <div className="hc-card-list">{assignments.map((assignment) => <SpotAssignmentCard key={assignment.assignment_id} assignment={assignment} />)}</div>
            </section>
          )}

          <section className="hc-section" aria-labelledby="spot-open-heading">
            <div className="hc-section-head"><h2 id="spot-open-heading">募集中のスポット勤務</h2></div>
            {jobs.length
              ? <div className="hc-card-list">{jobs.map((job) => <SpotJobCard key={job.job_id} job={job} applying={applyingId === job.job_id} onApply={() => void apply(job)} />)}</div>
              : <EmptyState
                  title="現在募集中のスポット勤務はありません"
                  body={assignments.length ? '確定済みの勤務は上の「あなたのスポット勤務」から確認できます。' : '新しい勤務枠が公開されると、ここに表示されます。'}
                  action="通常の求人を見る"
                  href="/jobs"
                />}
          </section>
        </>
      )}
    </div>
  );
}

function SpotFacts({ workDate, startTime, endTime, hourlyRate, breakMinutes }: { workDate: string; startTime: string; endTime: string; hourlyRate: number; breakMinutes: number }) {
  return (
    <dl className="hc-facts">
      <div><dt>勤務日</dt><dd>{formatWorkDate(workDate)}</dd></div>
      <div><dt>勤務時間</dt><dd>{formatTime(startTime)}〜{formatTime(endTime)}</dd></div>
      <div><dt>時給</dt><dd>¥{Number(hourlyRate).toLocaleString('ja-JP')}</dd></div>
      <div><dt>休憩</dt><dd>{breakMinutes}分</dd></div>
    </dl>
  );
}

function SpotAssignmentCard({ assignment }: { assignment: SpotAssignment }) {
  const workedMinutes = useMemo(() => Math.max(0, timeToMinutes(assignment.end_time) - timeToMinutes(assignment.start_time) - assignment.break_minutes), [assignment]);
  const active = assignment.assignment_status === 'confirmed';
  return <article id={`spot-assignment-${assignment.assignment_id}`} className={`hc-card spot-assignment-card ${active ? 'is-confirmed' : ''}`} tabIndex={-1}>
    <div className="hc-card-badges">
      <span className={`status-badge spot-status-${assignment.assignment_status}`}>{spotAssignmentStatusLabel(assignment.assignment_status)}</span>
      {active && <span className="hc-tag">勤務シフトに登録済み</span>}
    </div>
    <span className="hc-card-overline">{assignment.facility_name}</span>
    <h3>{assignment.title}</h3>
    <p className="hc-job-meta"><Icon name="map" size={16} /> {assignment.prefecture || '地域未設定'} {assignment.city || ''}</p>
    <SpotFacts workDate={assignment.work_date} startTime={assignment.start_time} endTime={assignment.end_time} hourlyRate={assignment.hourly_rate} breakMinutes={assignment.break_minutes} />
    <p className="hc-note">実働 {formatWorkedMinutes(workedMinutes)}{assignment.address ? ` ・ ${assignment.address}` : ''}</p>
    <div className="hc-card-actions"><a className="secondary-button" href={`/applications?application_id=${encodeURIComponent(assignment.application_id)}`}>応募内容を見る</a></div>
  </article>;
}

function SpotJobCard({ job, applying, onApply }: { job: SpotJobListing; applying: boolean; onApply: () => void }) {
  const workedMinutes = useMemo(() => Math.max(0, timeToMinutes(job.end_time) - timeToMinutes(job.start_time) - job.break_minutes), [job]);
  const applied = Boolean(job.application_id);
  return <article className="hc-card spot-job-card">
    <div className="hc-card-badges">
      <span className="hc-tag is-accent">スポット勤務</span>
      <span className="hc-tag">確定済みを除く残り {job.available_count}枠</span>
    </div>
    <span className="hc-card-overline">{job.facility_name}</span>
    <h3>{job.title}</h3>
    <p className="hc-job-meta"><Icon name="map" size={16} /> {job.prefecture || '地域未設定'} {job.city || ''}</p>
    <SpotFacts workDate={job.work_date} startTime={job.start_time} endTime={job.end_time} hourlyRate={job.hourly_rate} breakMinutes={job.break_minutes} />
    <ul className="hc-detail-list">
      <li><strong>実働</strong> {formatWorkedMinutes(workedMinutes)}</li>
      <li><strong>募集枠</strong> {job.required_count}名</li>
      {job.age_group_or_class && <li><strong>担当</strong> {job.age_group_or_class}</li>}
      {job.required_qualification && <li><strong>資格</strong> {job.required_qualification}</li>}
      {job.closing_at && <li><strong>募集終了予定</strong> {formatClosing(job.closing_at)}</li>}
    </ul>
    {job.description && <p className="hc-card-body">{job.description}</p>}
    {job.facility_message && <div className="hc-quote"><strong>園からのメッセージ</strong><p>{job.facility_message}</p></div>}
    <div className="hc-card-actions">
      {applied
        ? <><span className="hc-applied">応募済み{job.application_status ? `・${applicationStatusLabel(job.application_status)}` : ''}</span><a className="primary-button" href={`/applications?application_id=${encodeURIComponent(job.application_id!)}`}>応募状況を見る</a></>
        : <button className="primary-button" type="button" disabled={applying || job.available_count <= 0} onClick={onApply}>{applying ? '応募中…' : job.available_count <= 0 ? '満員です' : 'このスポットに応募'}</button>}
    </div>
  </article>;
}

function timeToMinutes(value: string) { const [h, m] = value.slice(0, 5).split(':').map(Number); return h * 60 + m; }
function formatTime(value: string) { return value.slice(0, 5); }
function formatWorkedMinutes(value: number) { const h = Math.floor(value / 60); const m = value % 60; return m ? `${h}時間${m}分` : `${h}時間`; }
function formatWorkDate(value: string) { return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(`${value}T12:00:00+09:00`)); }
function formatClosing(value: string) { return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(value)); }
function applicationStatusLabel(status: string) { return ({ new: '応募済み', applied: '応募済み', reviewing: '確認中', screening: '確認中', interview: '面接調整中', hired: '確定', rejected: '不採用', withdrawn: '辞退' } as Record<string, string>)[status] || status; }
function spotAssignmentStatusLabel(status: string) { return ({ confirmed: '勤務確定', completed: '勤務完了', cancelled: 'キャンセル', no_show: '未勤務' } as Record<string, string>)[status] || status; }
