import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InlineError } from './StateViews';
import { markJobseekerApplicationMessagesRead } from '../lib/attentionRepository';
import { errorMessage } from '../lib/useResource';
import { listApplicationMessages, sendApplicationMessage, type Message } from '../lib/messageRepository';
import {
  attachJobseekerDocumentToApplication,
  createAttachedApplicationDocumentSignedUrl,
  listJobseekerDocuments,
  listSubmittedApplicationDocuments,
  type AttachedApplicationDocument,
  type JobseekerDocument,
} from '../lib/documentVaultRepository';
import {
  listApplicationDocumentExpectations,
  type ApplicationDocumentExpectation,
} from '../lib/applicationDocumentExpectationRepository';

const documentLabels: Record<string, string> = {
  resume: '履歴書',
  work_history: '職務経歴書',
  nursery_teacher_license: '保育士証',
  kindergarten_license: '幼稚園教諭免許',
  other: 'その他',
};

type LoadMessageOptions = {
  acknowledge?: boolean;
  quiet?: boolean;
};

export function ApplicationMessages({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<JobseekerDocument[]>([]);
  const [submittedDocuments, setSubmittedDocuments] = useState<AttachedApplicationDocument[]>([]);
  const [attachedIds, setAttachedIds] = useState<string[]>([]);
  const [missingExpectedDocuments, setMissingExpectedDocuments] = useState<ApplicationDocumentExpectation[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [documentBusyId, setDocumentBusyId] = useState<string | null>(null);
  const [repairingDefaults, setRepairingDefaults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentNotice, setDocumentNotice] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const documentById = useMemo(
    () => new Map(documents.map((document) => [document.id, document])),
    [documents],
  );
  const repairableMissingDocuments = useMemo(
    () => missingExpectedDocuments
      .map((expectation) => documentById.get(expectation.source_jobseeker_document_id_snapshot))
      .filter((document): document is JobseekerDocument => Boolean(document)),
    [documentById, missingExpectedDocuments],
  );
  const unavailableMissingCount = missingExpectedDocuments.length - repairableMissingDocuments.length;

  // Facility messages become read only after the candidate opened this panel and the
  // messages actually loaded. Re-acknowledge only when a newer facility message arrives.
  const acknowledgedMessageRef = useRef<string | null>(null);
  const acknowledgingRef = useRef(false);
  const acknowledgeMessages = useCallback(async (loaded: Message[]) => {
    const newestFacilityMessage = [...loaded].reverse().find((message) => message.sender_role === 'facility');
    if (!newestFacilityMessage || acknowledgedMessageRef.current === newestFacilityMessage.id || acknowledgingRef.current) return;
    acknowledgingRef.current = true;
    try {
      const updated = await markJobseekerApplicationMessagesRead(applicationId);
      acknowledgedMessageRef.current = newestFacilityMessage.id;
      if (updated > 0) {
        window.dispatchEvent(new CustomEvent('hc:attention-refresh'));
        window.dispatchEvent(new CustomEvent('hc:notifications-refresh'));
      }
    } catch {
      // The server's unread state stays the source of truth; the next load retries.
    } finally {
      acknowledgingRef.current = false;
    }
  }, [applicationId]);

  const load = useCallback(async ({ acknowledge = false, quiet = false }: LoadMessageOptions = {}) => {
    if (!quiet && mountedRef.current) {
      setLoading(true);
      setError(null);
    }
    try {
      const next = await listApplicationMessages(applicationId);
      if (!mountedRef.current) return;
      setMessages(next);
      if (acknowledge) void acknowledgeMessages(next);
    } catch (err) {
      if (!mountedRef.current || quiet) return;
      setError(errorMessage(err, 'メッセージを読み込めませんでした。'));
    } finally {
      if (mountedRef.current && !quiet) setLoading(false);
    }
  }, [applicationId, acknowledgeMessages]);

  const loadDocuments = useCallback(async (quiet = false) => {
    try {
      const [saved, submitted, expectations] = await Promise.all([
        listJobseekerDocuments(),
        listSubmittedApplicationDocuments(applicationId),
        listApplicationDocumentExpectations(applicationId),
      ]);
      if (!mountedRef.current) return;
      const nextAttachedIds = submitted
        .map((document) => document.source_jobseeker_document_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
      const submittedPaths = new Set(submitted.map((document) => document.file_path));
      const savedIds = new Set(saved.map((document) => document.id));
      const submittedTypes = new Set(submitted.map((document) => document.document_type));
      const missingExpectations = expectations.filter((expectation) => {
        if (submittedPaths.has(expectation.destination_file_path)) return false;
        if (!savedIds.has(expectation.source_jobseeker_document_id_snapshot)
          && submittedTypes.has(expectation.document_type)) return false;
        return true;
      });
      setDocuments(saved);
      setSubmittedDocuments(submitted);
      setAttachedIds(nextAttachedIds);
      setMissingExpectedDocuments(missingExpectations);
    } catch (err) {
      if (!mountedRef.current || quiet) return;
      setError(errorMessage(err, '応募書類を読み込めませんでした。'));
    }
  }, [applicationId]);

  const openAndLoad = useCallback(async () => {
    setOpen(true);
    await Promise.allSettled([load({ acknowledge: true }), loadDocuments()]);
  }, [load, loadDocuments]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (window.location.hash !== '#application-messages') return;
    void openAndLoad();
  }, [applicationId, openAndLoad]);

  useEffect(() => {
    if (!open) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void Promise.allSettled([
        load({ acknowledge: true, quiet: true }),
        loadDocuments(true),
      ]);
    };
    const intervalId = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('pageshow', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('hc:messages-refresh', refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('pageshow', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('hc:messages-refresh', refreshWhenVisible);
    };
  }, [load, loadDocuments, open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) await Promise.allSettled([load({ acknowledge: true }), loadDocuments()]);
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
      setError(errorMessage(err, 'メッセージを送信できませんでした。'));
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
      setError(errorMessage(err, '応募書類を提出できませんでした。'));
    } finally {
      setDocumentBusyId(null);
    }
  };

  const attachMissingExpectedDocuments = async () => {
    if (!repairableMissingDocuments.length) return;
    setRepairingDefaults(true);
    setError(null);
    setDocumentNotice(null);
    try {
      const results = await Promise.allSettled(
        repairableMissingDocuments.map((document) => attachJobseekerDocumentToApplication(document, applicationId)),
      );
      await loadDocuments();
      const failedCount = results.filter((result) => result.status === 'rejected').length;
      if (failedCount > 0) {
        setError(`応募時書類${repairableMissingDocuments.length}件のうち${failedCount}件を提出できませんでした。未提出の書類は個別に再試行してください。`);
      } else {
        setDocumentNotice(`応募時に選ばれていた未提出書類${repairableMissingDocuments.length}件をこの応募先へ提出しました。`);
      }
    } catch (err) {
      setError(errorMessage(err, '応募時書類を提出できませんでした。'));
    } finally {
      setRepairingDefaults(false);
    }
  };

  const openSubmittedDocument = async (document: AttachedApplicationDocument) => {
    setError(null);
    try {
      const url = await createAttachedApplicationDocumentSignedUrl(document);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(errorMessage(err, '提出済み書類を開けませんでした。'));
    }
  };

  const reloadAll = () => void Promise.allSettled([load({ acknowledge: true }), loadDocuments()]);

  return <div className="hc-messages">
    <button className="secondary-button hc-messages-toggle" type="button" onClick={toggle} aria-expanded={open}>
      {open ? 'メッセージ・書類を閉じる' : '園とのメッセージ・書類を開く'}
    </button>
    {open && <div className="hc-messages-panel" data-application-messages-panel={applicationId}>
      <div className="hc-messages-head">
        <h3>園とのメッセージ</h3>
        <button type="button" className="hc-link-button" onClick={reloadAll} disabled={loading}>{loading ? '更新中…' : '更新'}</button>
      </div>
      {error && <InlineError message={error} onRetry={reloadAll} />}
      <div className="hc-message-list" aria-live="polite">
        {loading && !messages.length ? <p className="hc-note">読み込んでいます…</p> : null}
        {!loading && !error && !messages.length ? <p className="hc-note">まだメッセージはありません。ここから園へ連絡できます。</p> : null}
        {messages.map((message) => <div key={message.id} className={`hc-message ${message.sender_role === 'jobseeker' ? 'is-mine' : 'is-facility'}`}>
          <small>{message.sender_role === 'jobseeker' ? 'あなた' : '園'} ・ {formatDateTime(message.created_at)}</small>
          <p>{message.body}</p>
        </div>)}
      </div>

      <label className="hc-field hc-message-compose">
        <span>メッセージ</span>
        <textarea rows={3} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="園への質問や日程の相談など" />
      </label>
      <div className="hc-message-send">
        <small>{draft.length}/4000</small>
        <button className="primary-button" type="button" onClick={send} disabled={sending || !draft.trim()}>{sending ? '送信中…' : '送信する'}</button>
      </div>

      <section className="hc-documents" aria-label="この応募に提出する書類">
        <div className="hc-messages-head">
          <h3>応募書類</h3>
          <a className="hc-link-button" href="/profile">書類庫を管理</a>
        </div>
        {missingExpectedDocuments.length > 0 && <div className="hc-document-alert" role="alert">
          <p>応募した時点で「応募時に使用」に設定されていた書類のうち、{missingExpectedDocuments.length}件がこの応募にはまだ提出されていません。</p>
          {repairableMissingDocuments.length > 0 && <button className="secondary-button" type="button" onClick={() => void attachMissingExpectedDocuments()} disabled={repairingDefaults || documentBusyId !== null}>
            {repairingDefaults ? '応募時書類を提出中…' : '未提出の応募時書類をまとめて提出'}
          </button>}
          {unavailableMissingCount > 0 && <small>応募時に選ばれていた書類のうち{unavailableMissingCount}件は現在の書類庫にありません。必要な場合は、下の現在の書類をこの応募へ提出してください。</small>}
        </div>}
        {documentNotice && <p className="form-success" role="status">{documentNotice}</p>}
        {documents.length ? <div className="hc-document-list">
          {documents.map((document) => {
            const attached = attachedIds.includes(document.id);
            return <div key={document.id} className="hc-document-row">
              <span className="hc-document-name">
                <strong>{documentLabels[document.document_type] || '書類'}{document.is_default ? ' ・応募時に使用' : ''}</strong>
                <small>{document.title}</small>
              </span>
              <button className="secondary-button" type="button" disabled={attached || repairingDefaults || documentBusyId !== null} onClick={() => void attachDocument(document)}>
                {attached ? '提出済み' : documentBusyId === document.id ? '提出中…' : 'この応募に提出'}
              </button>
            </div>;
          })}
        </div> : <p className="hc-note">保存済みの書類はありません。マイページの「応募書類」から履歴書や保育士証を一度保存すると、次の応募でも再利用できます。</p>}

        {submittedDocuments.length ? <div className="hc-document-list is-submitted">
          <strong>この応募へ提出済み</strong>
          {submittedDocuments.map((document) => <div key={document.id} className="hc-document-row">
            <span className="hc-document-name">
              <strong>{documentLabels[document.document_type] || '書類'}</strong>
              <small>{document.title}</small>
            </span>
            <button className="secondary-button" type="button" onClick={() => void openSubmittedDocument(document)}>開く</button>
          </div>)}
          <small>提出済みコピーは書類庫の元ファイルを削除しても、この応募の記録として保持されます。</small>
        </div> : null}
      </section>
    </div>}
  </div>;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
