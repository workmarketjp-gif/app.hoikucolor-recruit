import { useEffect, useMemo, useState } from 'react';
import {
  cancelVisit,
  getVisitSettings,
  listMyVisitReservations,
  requestVisit,
  type VisitExperienceType,
  type VisitReservation,
  type VisitSettings,
} from '../lib/visitRepository';
import './VisitTrialPanel.css';

const typeLabels: Record<VisitExperienceType, string> = {
  visit: '園見学',
  half_day_trial: '半日体験',
  full_day_trial: '1日体験',
};

const statusLabels: Record<VisitReservation['status'], string> = {
  requested: '申込確認中',
  confirmed: '予約確定',
  declined: '日程再調整',
  cancelled: 'キャンセル済み',
  completed: '参加済み',
  no_show: '未参加',
};

const weekdayLabels = ['月', '火', '水', '木', '金', '土', '日'];

function hhmm(value: string) {
  return value.slice(0, 5);
}

function toMinutes(value: string) {
  const [hour, minute] = hhmm(value).split(':').map(Number);
  return hour * 60 + minute;
}

function fromMinutes(value: number) {
  const hour = Math.floor(value / 60).toString().padStart(2, '0');
  const minute = (value % 60).toString().padStart(2, '0');
  return `${hour}:${minute}`;
}

function formatJapanDateTime(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function enabledTypes(settings: VisitSettings): VisitExperienceType[] {
  const result: VisitExperienceType[] = [];
  if (settings.visit_enabled) result.push('visit');
  if (settings.half_day_trial_enabled) result.push('half_day_trial');
  if (settings.full_day_trial_enabled) result.push('full_day_trial');
  return result;
}

export function VisitTrialPanel({ jobId, facilityId }: { jobId: string; facilityId: string }) {
  const [settings, setSettings] = useState<VisitSettings | null>(null);
  const [reservations, setReservations] = useState<VisitReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [experienceType, setExperienceType] = useState<VisitExperienceType>('visit');
  const [localDate, setLocalDate] = useState('');
  const [localTime, setLocalTime] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reloadReservations = async () => {
    const rows = await listMyVisitReservations(jobId);
    setReservations(rows);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getVisitSettings(facilityId), listMyVisitReservations(jobId)])
      .then(([settingRow, reservationRows]) => {
        if (!active) return;
        setSettings(settingRow);
        setReservations(reservationRows);
        const firstType = settingRow ? enabledTypes(settingRow)[0] : undefined;
        if (firstType) setExperienceType(firstType);
        setError(null);
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : '見学・体験情報を読み込めませんでした。'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [facilityId, jobId]);

  const timeOptions = useMemo(() => {
    if (!settings) return [];
    const start = toMinutes(settings.first_start_time);
    const end = toMinutes(settings.last_start_time);
    const interval = Math.max(15, settings.slot_interval_minutes || 30);
    const options: string[] = [];
    for (let value = start; value <= end; value += interval) options.push(fromMinutes(value));
    return options;
  }, [settings]);

  useEffect(() => {
    if (timeOptions.length && !timeOptions.includes(localTime)) setLocalTime(timeOptions[0]);
  }, [localTime, timeOptions]);

  if (loading) return <div className="visit-trial-loading">見学・体験の受付状況を確認しています…</div>;
  if (!settings || enabledTypes(settings).length === 0) return null;

  const activeReservation = reservations.find((reservation) => reservation.status === 'requested' || reservation.status === 'confirmed');
  const modes = enabledTypes(settings);
  const days = settings.available_weekdays.map((day) => weekdayLabels[day - 1]).filter(Boolean).join('・');

  const submit = async () => {
    if (!localDate || !localTime) {
      setError('希望日と時間を選択してください。');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await requestVisit({
        jobId,
        experienceType,
        localDate,
        localTime,
        candidateMessage: message,
      });
      await reloadReservations();
      setMessage('');
      setSuccess('見学・体験を申し込みました。園からの確定連絡をお待ちください。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '見学・体験を申し込めませんでした。');
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (reservationId: string) => {
    setCancelling(true);
    setError(null);
    setSuccess(null);
    try {
      await cancelVisit(reservationId);
      await reloadReservations();
      setSuccess('予約をキャンセルしました。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '予約をキャンセルできませんでした。');
    } finally {
      setCancelling(false);
    }
  };

  return <section className="visit-trial-panel" aria-label="見学・体験予約">
    <div className="visit-trial-head">
      <div><span>VISIT / EXPERIENCE</span><strong>応募前に、園を見てみる</strong></div>
      <em>受付中</em>
    </div>

    {activeReservation ? <div className="visit-reservation-card">
      <div><span className={`visit-status status-${activeReservation.status}`}>{statusLabels[activeReservation.status]}</span><strong>{typeLabels[activeReservation.experience_type]}</strong></div>
      <p>{formatJapanDateTime(activeReservation.starts_at)}（園の現地時間）</p>
      {activeReservation.facility_message && <small>園から：{activeReservation.facility_message}</small>}
      <button type="button" className="secondary-button" disabled={cancelling} onClick={() => cancel(activeReservation.id)}>{cancelling ? '処理中…' : '予約をキャンセル'}</button>
    </div> : <>
      <div className="visit-mode-grid">
        {modes.map((mode) => <button type="button" key={mode} className={experienceType === mode ? 'active' : ''} onClick={() => setExperienceType(mode)}>
          <strong>{typeLabels[mode]}</strong>
          <small>{mode === 'visit' ? `${settings.visit_duration_minutes}分` : mode === 'half_day_trial' ? `約${Math.round(settings.half_day_duration_minutes / 60)}時間` : `約${Math.round(settings.full_day_duration_minutes / 60)}時間`}</small>
        </button>)}
      </div>
      <div className="visit-form-grid">
        <label><span>希望日</span><input type="date" value={localDate} onChange={(event) => setLocalDate(event.target.value)} /></label>
        <label><span>開始時間</span><select value={localTime} onChange={(event) => setLocalTime(event.target.value)}>{timeOptions.map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
      </div>
      <small className="visit-availability">受付曜日：{days || '設定中'} ／ {hhmm(settings.first_start_time)}〜{hhmm(settings.last_start_time)} ／ {settings.min_notice_hours}時間前まで ／ 最大{settings.max_days_ahead}日先まで</small>
      <label className="visit-message"><span>園へのひとこと（任意）</span><textarea rows={2} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="見学で確認したいことなどがあれば入力してください" /></label>
      {settings.public_note && <p className="visit-note">{settings.public_note}</p>}
      {(settings.what_to_bring || settings.dress_code) && <div className="visit-guidance">{settings.what_to_bring && <span><strong>持ち物</strong>{settings.what_to_bring}</span>}{settings.dress_code && <span><strong>服装</strong>{settings.dress_code}</span>}</div>}
      <button type="button" className="primary-button visit-submit" onClick={submit} disabled={submitting}>{submitting ? '申込中…' : `${typeLabels[experienceType]}を申し込む`}</button>
    </>}
    {error && <span className="form-error">{error}</span>}
    {success && <span className="form-success">{success}</span>}
    <small className="visit-trial-footnote">日時は園の現地時間です。申込後、園が確認すると予約確定になります。</small>
  </section>;
}
