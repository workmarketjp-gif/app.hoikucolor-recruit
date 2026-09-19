import { useCallback, useEffect, useState } from 'react';
import {
  acceptCandidateOffer,
  getCandidateDecisionApplication,
  withdrawCandidateApplication,
  type CandidateDecisionApplication,
} from '../lib/applicationDecisionRepository';

type Props = {
  applicationId: string;
  onChanged: () => Promise<void>;
};

const WITHDRAWABLE_STATUSES = new Set(['new', 'reviewing', 'interview', 'offered']);

export function ApplicationDecisionPanel({ applicationId, onChanged }: Props) {
  const [application, setApplication] = useState<CandidateDecisionApplication | null>(null);
  const [message, setMessage] = useState('');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [busy, setBusy] = useState<'accept' | 'withdraw' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await getCandidateDecisionApplication(applicationId);
      setApplication(next);
      setError(null);
    } catch (err) {
      if (!quiet) setError(err instanceof Error ? err.message : '応募の回答状況を確認できませんでした。');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refreshAll = async () => {
    await Promise.allSettled([load(true), onChanged()]);
    window.dispatchEvent(new CustomEvent('hc:applications-refresh'));
    window.dispatchEvent(new CustomEvent('hc:attention-refresh'));
    window.dispatchEvent(new CustomEvent('hc:notifications-refresh'));
    window.dispatchEvent(new CustomEvent('hc:messages-refresh'));
  };

  const acceptOffer = async () => {
    if (!application || application.status !== 'offered' || application.candidate_offer_response === 'accepted') return;
    if (!window.confirm('この園からの内定を承諾しますか？')) return;
    setBusy('accept');
    setError(null);
    setNotice(null);
    try {
      await acceptCandidateOffer(application.id, message);
      setNotice('内定を承諾しました。園にも同じ応募記録として反映されます。');
      setMessage('');
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '内定を承諾できませんでした。');
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async () => {
    if (!application || !WITHDRAWABLE_STATUSES.has(application.status)) return;
    const offered = application.status === 'offered';
    const accepted = offered && application.candidate_offer_response === 'accepted';
    const confirmation = accepted
      ? '承諾済みの内定を取り消して辞退しますか？'
      : offered
        ? 'この内定を辞退しますか？'
        : 'この応募を辞退しますか？';
    if (!window.confirm(confirmation)) return;
    setBusy('withdraw');
    setError(null);
    setNotice(null);
    try {
      await withdrawCandidateApplication(application.id, message);
      setNotice(offered ? '内定を辞退しました。' : '応募を辞退しました。');
      setMessage('');
      setWithdrawOpen(false);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : offered ? '内定を辞退できませんでした。' : '応募を辞退できませんでした。');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="application-decision-panel"><small>応募の回答状況を確認しています…</small></div>;
  if (!application) return null;

  const accepted = application.status === 'offered' && application.candidate_offer_response === 'accepted';
  const canWithdraw = WITHDRAWABLE_STATUSES.has(application.status);
  const offered = application.status === 'offered';

  if (!canWithdraw && !accepted) return null;

  return <section className={`application-decision-panel ${offered ? 'is-offer' : ''}`} aria-label="応募・内定への回答">
    <div className="application-decision-copy">
      <span className="eyebrow">YOUR DECISION</span>
      <h2>{accepted ? '内定を承諾済み' : offered ? '内定への回答' : '応募を辞退する場合'}</h2>
      <p>{accepted
        ? 'この内定は承諾済みです。以降の案内は園とのメッセージで確認できます。事情が変わった場合は、ここから承諾を取り消して辞退できます。'
        : offered
          ? '承諾または辞退を選ぶと、この応募の選考記録と園側の状態が同時に更新されます。'
          : '選考を続けない場合は、ここから応募を辞退できます。予定中の面接・見学・体験も同時にキャンセルされます。'}</p>
      {application.candidate_offer_responded_at && <small>回答日時: {formatDateTime(application.candidate_offer_responded_at)}</small>}
      {application.candidate_offer_message && <small className="application-decision-saved-message">連絡事項: {application.candidate_offer_message}</small>}
    </div>

    <div className="application-decision-actions">
      {(offered || withdrawOpen) && <label className="application-decision-message">
        <span>{accepted ? '辞退理由・園への連絡（任意）' : offered ? '園への連絡事項（任意）' : '辞退理由（任意）'}</span>
        <textarea rows={3} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={accepted ? '例：事情が変わったため、承諾後で恐縮ですが辞退いたします。' : offered ? '例：内定ありがとうございます。入職日についてご相談させてください。' : '例：一身上の都合により辞退いたします。'} />
        <small>{message.length}/1000</small>
      </label>}
      <div className="application-decision-buttons">
        {offered && !accepted && <button className="primary-button" type="button" disabled={busy !== null} onClick={() => void acceptOffer()}>{busy === 'accept' ? '承諾中…' : '内定を承諾'}</button>}
        {canWithdraw && <button className="secondary-button" type="button" disabled={busy !== null} onClick={() => offered || withdrawOpen ? void withdraw() : setWithdrawOpen(true)}>{busy === 'withdraw' ? '辞退処理中…' : accepted ? '承諾を取り消して辞退' : offered ? '内定を辞退' : withdrawOpen ? '応募を辞退' : '辞退手続きを開く'}</button>}
        {!offered && withdrawOpen && <button className="secondary-button" type="button" disabled={busy !== null} onClick={() => { setWithdrawOpen(false); setMessage(''); setError(null); }}>閉じる</button>}
      </div>
    </div>

    {notice && <p className="form-success application-decision-feedback" role="status">{notice}</p>}
    {error && <p className="form-error application-decision-feedback" role="alert">{error}</p>}
  </section>;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}
