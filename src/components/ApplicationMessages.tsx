import { useState } from 'react';
import { listApplicationMessages, sendApplicationMessage, type Message } from '../lib/messageRepository';
import {
  attachJobseekerDocumentToApplication,
  createAttachedApplicationDocumentSignedUrl,
  listJobseekerDocuments,
  listSubmittedApplicationDocuments,
  type AttachedApplicationDocument,
  type JobseekerDocument,
} from '../lib/documentVaultRepository';

const documentLabels: Record<string, string> = {
  resume: '履歴書',
  work_history: '職務経歴書',
  nursery_teacher_license: '保育士証',
  kindergarten_license: '幼稚園教諭免許',
  other: 'その他',
};

export function ApplicationMessages({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<JobseekerDocument[]>([]);
  const [submittedDocuments, setSubmittedDocuments] = useState<AttachedApplicationDocument[]>([]);
  const [attachedIds, setAttachedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [documentBusyId, setDocumentBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [documentNotice, setDocumentNotice] = useState<string | null>(null);

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

  const loadDocuments = async () => {
    try {
      const [saved, submitted] = await Promise.all([
        listJobseekerDocuments(),
        listSubmittedApplicationDocuments(applicationId),
      ]);
      setDocuments(saved);
      setSubmittedDocuments(submitted);
      setAttachedIds(submitted
        .map((document) => document.source_jobseeker_document_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : '応募書類を読み込めませんでした。');
    }
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) await Promise.allSettled([load(), loadDocuments()]);
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

  const attachDocument = async (document: JobseekerDocument) => {
    if (attachedIds.includes(document.id)) return;
    setDocumentBusyId(document.id);
    setError(null);
    setDocumentNotice(null);
    try {
      await attachJobseekerDocumentToApplication(document, applicationId);
      await loadDocuments();
      setDocumentNotice(`${documentLabels[document.document_type] || '書類'}をこの応募先へ提出しました。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '応募書類を提出できませんでした。');
    } finally {
      setDocumentBusyId(null);
    }
  };

  const openSubmittedDocument = async (document: AttachedApplicationDocument) => {
    setError(null);
    try {
      const url = await createAttachedApplicationDocumentSignedUrl(document);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : '提出済み書類を開けませんでした。');
    }
  };

  return <div style={{ width: '100%', marginTop: 8 }}>
    <button className="secondary-button" type="button" onClick={toggle} aria-expanded={open}>
      {open ? 'メッセージ・書類を閉じる' : '園とメッセージ・書類'}
    </button>
    {open && <div className="panel" style={{ marginTop: 10, padding: 14, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <strong>園とのメッセージ</strong>
        <button type="button" className="secondary-button" onClick={() => void Promise.allSettled([load(), loadDocuments()])} disabled={loading}>{loading ? '更新中…' : '更新'}</button>
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

      <section style={{ margin: '4px 0 14px', padding: '12px 0', borderTop: '1px solid var(--border, #e7e7ea)', borderBottom: '1px solid var(--border, #e7e7ea)' }} aria-label="この応募に提出する書類">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 9 }}>
          <strong style={{ fontSize: 13 }}>応募書類</strong>
          <a href="/profile" style={{ fontSize: 12 }}>書類庫を管理</a>
        </div>
        {documentNotice && <p className="form-success" style={{ margin: '0 0 8px' }}>{documentNotice}</p>}
        {documents.length ? <div style={{ display: 'grid', gap: 8 }}>
          {documents.map((document) => {
            const attached = attachedIds.includes(document.id);
            return <div key={document.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
              <span style={{ display: 'grid', minWidth: 0, flex: '1 1 190px' }}>
                <strong style={{ fontSize: 12 }}>{documentLabels[document.document_type] || '書類'}{document.is_default ? ' ・応募時に使用' : ''}</strong>
                <small style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{document.title}</small>
              </span>
              <button className="secondary-button" type="button" disabled={attached || documentBusyId !== null} onClick={() => void attachDocument(document)}>
                {attached ? '提出済み' : documentBusyId === document.id ? '提出中…' : 'この応募に提出'}
              </button>
            </div>;
          })}
        </div> : <small>保存済みの書類はありません。プロフィールの「応募書類」から履歴書や保育士証を一度保存すると、次の応募でも再利用できます。</small>}

        {submittedDocuments.length ? <div style={{ display: 'grid', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border, #e7e7ea)' }}>
          <strong style={{ fontSize: 12 }}>この応募へ提出済み</strong>
          {submittedDocuments.map((document) => <div key={document.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
            <span style={{ display: 'grid', minWidth: 0, flex: '1 1 190px' }}>
              <strong style={{ fontSize: 12 }}>{documentLabels[document.document_type] || '書類'}</strong>
              <small style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{document.title}</small>
            </span>
            <button className="secondary-button" type="button" onClick={() => void openSubmittedDocument(document)}>開く</button>
          </div>)}
          <small>提出済みコピーは書類庫の元ファイルを削除しても、この応募の記録として保持されます。</small>
        </div> : null}
      </section>

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