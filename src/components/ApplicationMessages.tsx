import { useState } from 'react';
import { listApplicationMessages, sendApplicationMessage, type Message } from '../lib/messageRepository';

export function ApplicationMessages({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setMessages(await listApplicationMessages(applicationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'メッセージを読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) await load();
  };

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendApplicationMessage(applicationId, draft);
      setMessages((current) => [...current, message]);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'メッセージを送信できませんでした。');
    } finally {
      setSending(false);
    }
  };

  return <div style={{ width: '100%', marginTop: 8 }}>
    <button className="secondary-button" type="button" onClick={toggle} aria-expanded={open}>
      {open ? 'メッセージを閉じる' : '園とメッセージ'}
    </button>
    {open && <div className="panel" style={{ marginTop: 10, padding: 14, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <strong>園とのメッセージ</strong>
        <button type="button" className="secondary-button" onClick={load} disabled={loading}>{loading ? '更新中…' : '更新'}</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div aria-live="polite" style={{ display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto', marginBottom: 12 }}>
        {loading && !messages.length ? <small>読み込んでいます…</small> : null}
        {!loading && !messages.length ? <small>まだメッセージはありません。ここから園へ連絡できます。</small> : null}
        {messages.map((message) => <div key={message.id} style={{ padding: '10px 12px', borderRadius: 12, background: message.sender_role === 'jobseeker' ? 'var(--surface-soft, #f7f7f8)' : 'var(--surface, #fff)', border: '1px solid var(--border, #e7e7ea)' }}>
          <small>{message.sender_role === 'jobseeker' ? 'あなた' : '園'} ・ {formatDateTime(message.created_at)}</small>
          <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.body}</p>
        </div>)}
      </div>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>メッセージ</span>
        <textarea rows={3} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="園への質問や日程の相談など" style={{ width: '100%', resize: 'vertical' }} />
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <small>{draft.length}/4000</small>
        <button className="primary-button" type="button" onClick={send} disabled={sending || !draft.trim()}>{sending ? '送信中…' : '送信する'}</button>
      </div>
    </div>}
  </div>;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
