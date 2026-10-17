import { useCandidateSession } from '../lib/candidateSession';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import {
  createJobseekerDocumentSignedUrl,
  deleteJobseekerDocument,
  describeDocumentError,
  listJobseekerDocuments,
  setDefaultJobseekerDocument,
  uploadJobseekerDocument,
  type JobseekerDocument,
  type JobseekerDocumentType,
} from '../lib/documentVaultRepository';

const labels: Record<JobseekerDocumentType, string> = {
  resume: '履歴書',
  work_history: '職務経歴書',
  nursery_teacher_license: '保育士証',
  kindergarten_license: '幼稚園教諭免許',
  other: 'その他',
};

type UploadIntent = {
  documentType: JobseekerDocumentType;
  makeDefault: boolean;
  replacement: boolean;
};

function formatBytes(value: number | null) {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentVaultPanel() {
  const { userId } = useCandidateSession();
  const user = userId ? { id: userId } : null;
  const [documents, setDocuments] = useState<JobseekerDocument[]>([]);
  const [documentType, setDocumentType] = useState<JobseekerDocumentType>('resume');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failedUpload, setFailedUpload] = useState<{ file: File; intent: UploadIntent } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadIntentRef = useRef<UploadIntent | null>(null);

  const chooseFile = (intent?: Partial<UploadIntent> & Pick<UploadIntent, 'documentType'>) => {
    if (busy) return;
    const targetType = intent?.documentType ?? documentType;
    const sameTypeExists = documents.some((item) => item.document_type === targetType);
    uploadIntentRef.current = {
      documentType: targetType,
      makeDefault: intent?.makeDefault ?? !sameTypeExists,
      replacement: intent?.replacement ?? false,
    };
    fileRef.current?.click();
  };

  const load = async () => {
    setLoading(true);
    try {
      setDocuments(await listJobseekerDocuments());
      setError(null);
    } catch (err) {
      setError(describeDocumentError(err, '応募書類を読み込めませんでした。画面を再読み込みしてください。'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const upload = async (file: File, intent: UploadIntent) => {
    if (!user?.id) {
      setError('ログインユーザーを確認できませんでした。');
      return;
    }
    setBusy(true); setError(null); setNotice(null); setFailedUpload(null);
    try {
      await uploadJobseekerDocument(user.id, intent.documentType, file, { makeDefault: intent.makeDefault });
      await load();
      if (intent.replacement) {
        setNotice(`${labels[intent.documentType]}を差し替えました。以前の書類は書類庫に残っています。不要なら削除できます。`);
      } else {
        setNotice(`${labels[intent.documentType]}を保存しました。応募時に何度でも再利用できます。`);
      }
    } catch (err) {
      setError(describeDocumentError(err, '書類を保存できませんでした。通信状況を確認して、もう一度お試しください。'));
      setFailedUpload({ file, intent });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const open = async (document: JobseekerDocument) => {
    try {
      const url = await createJobseekerDocumentSignedUrl(document);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(describeDocumentError(err, '書類を開けませんでした。もう一度お試しください。'));
    }
  };

  const makeDefault = async (document: JobseekerDocument) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await setDefaultJobseekerDocument(document.id);
      await load();
      setNotice(`${labels[document.document_type]}の応募時に使う書類を変更しました。`);
    } catch (err) {
      setError(describeDocumentError(err, '応募時に使う書類を変更できませんでした。もう一度お試しください。'));
    } finally { setBusy(false); }
  };

  const remove = async (document: JobseekerDocument) => {
    if (!window.confirm(`${document.title} を書類庫から削除しますか？\nすでに応募先へ提出済みのコピーは削除されません。`)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await deleteJobseekerDocument(document);
      await load();
      setNotice('書類庫から削除しました。提出済みの応募書類はそのまま保持されます。');
    } catch (err) {
      setError(describeDocumentError(err, '書類を削除できませんでした。もう一度お試しください。'));
    } finally { setBusy(false); }
  };

  return <>
    <section className="form-section" aria-labelledby="document-vault-heading">
      <div className="form-section-head">
        <h3 id="document-vault-heading">応募書類</h3>
        <p>一度保存した履歴書や資格証を、次の応募でも再利用できます。ファイルは非公開で保存され、応募した園にだけ提出用コピーが共有されます。</p>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={documentType} onChange={(e) => setDocumentType(e.target.value as JobseekerDocumentType)} style={{ minHeight: 44, flex: '1 1 190px' }}>
            {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={(e) => {
            const file = e.target.files?.[0];
            const intent = uploadIntentRef.current ?? {
              documentType,
              makeDefault: !documents.some((item) => item.document_type === documentType),
              replacement: false,
            };
            uploadIntentRef.current = null;
            if (file) void upload(file, intent);
          }} />
          <button className="secondary-button" type="button" disabled={busy} onClick={() => chooseFile({ documentType })}>
            <Icon name="upload" size={16} /> {busy ? '保存しています…' : '書類を追加'}
          </button>
        </div>
        <small>PDF・画像（JPEG / PNG）、1ファイル10MBまで。各種類の「応募時に使う」を1件選べます。</small>
        <div aria-live="polite" role="status" style={{ display: 'grid', gap: 8 }}>
          {busy && <span>書類を保存しています。画面を閉じずにお待ちください。</span>}
          {notice && <span className="form-success">{notice}</span>}
        </div>
        {error && <div role="alert" style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
          <span className="form-error">{error}</span>
          {failedUpload && !busy && <button type="button" className="secondary-button" onClick={() => void upload(failedUpload.file, failedUpload.intent)}>
            同じファイルでもう一度保存する
          </button>}
        </div>}
        {loading ? <div className="empty-state"><p>応募書類を読み込んでいます。</p></div> : documents.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {documents.map((document) => <article key={document.id} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', border: '1px solid var(--border, #e8e8ee)', borderRadius: 14, padding: '12px 14px', minWidth: 0 }}>
              <button type="button" onClick={() => void open(document)} style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0, flex: '1 1 240px', textAlign: 'left', background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}>
                <span className="metric-icon"><Icon name="file" size={17} /></span>
                <span style={{ display: 'grid', minWidth: 0 }}>
                  <strong>{labels[document.document_type]} {document.is_default ? '・応募時に使用' : ''}</strong>
                  <small style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{document.title}{document.file_size ? ` ・ ${formatBytes(document.file_size)}` : ''}</small>
                </span>
              </button>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {document.is_default
                  ? <button type="button" className="secondary-button" disabled={busy} onClick={() => chooseFile({ documentType: document.document_type, makeDefault: true, replacement: true })}>差し替え</button>
                  : <button type="button" className="secondary-button" disabled={busy} onClick={() => void makeDefault(document)}>応募時に使う</button>}
                <button type="button" className="secondary-button" disabled={busy} onClick={() => void remove(document)}>削除</button>
              </div>
            </article>)}
          </div>
        ) : <div className="empty-state">
          <h3>保存した応募書類はまだありません</h3>
          <p>まずは履歴書を1件保存してください。保育士証などはあとから追加できます。</p>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => chooseFile({ documentType: 'resume', makeDefault: true })}>
            <Icon name="upload" size={16} /> 履歴書を追加
          </button>
        </div>}
      </div>
    </section>
  </>;
}
