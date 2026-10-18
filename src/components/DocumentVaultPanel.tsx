import { useCandidateSession } from '../lib/candidateSession';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import {
  createJobseekerDocumentSignedUrl,
  deleteJobseekerDocument,
  describeDocumentError,
  NonRetryableDocumentError,
  listJobseekerDocuments,
  setDefaultJobseekerDocument,
  uploadJobseekerDocument,
  type JobseekerDocument,
  type JobseekerDocumentType,
} from '../lib/documentVaultRepository';
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPE_ORDER, evidenceTypesForQualification } from '../lib/documentTypes';

const labels = DOCUMENT_TYPE_LABELS;

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

/**
 * `qualifications` are the profile's declared (self-reported) qualifications. They are shown
 * next to, never merged with, the uploaded files: saving a licence copy is not verification.
 */
export function DocumentVaultPanel({ qualifications }: { qualifications?: string[] }) {
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
      if (!(err instanceof NonRetryableDocumentError)) setFailedUpload({ file, intent });
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
        <h2 id="document-vault-heading">応募書類</h2>
        <p>一度保存した履歴書や資格証を、次の応募でも再利用できます。ファイルは非公開で保存され、応募した園にだけ提出用コピーが共有されます。</p>
      </div>
      <div className="doc-vault">
        <div className="doc-vault-add">
          <select value={documentType} onChange={(e) => setDocumentType(e.target.value as JobseekerDocumentType)} aria-label="追加する書類の種類">
            {DOCUMENT_TYPE_ORDER.map((value) => <option key={value} value={value}>{labels[value]}</option>)}
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
        <small className="doc-vault-hint">PDF・画像（JPEG / PNG）、1ファイル10MBまで。各種類の「応募時に使う」を1件選べます。</small>
        <a className="secondary-button" href="/resume"><Icon name="file" size={16} /> 履歴書・職務経歴書をアプリで作る</a>
        <div aria-live="polite" role="status" className="doc-vault-status">
          {busy && <span>書類を保存しています。画面を閉じずにお待ちください。</span>}
          {notice && <span className="form-success">{notice}</span>}
        </div>
        {error && <div role="alert" className="doc-vault-status is-error">
          <span className="form-error">{error}</span>
          {failedUpload && !busy && <button type="button" className="secondary-button" onClick={() => void upload(failedUpload.file, failedUpload.intent)}>
            同じファイルでもう一度保存する
          </button>}
        </div>}
        {qualifications && !loading && <div style={{ display: 'grid', gap: 10 }}>
          <h4 id="qualification-evidence-heading" style={{ margin: 0, fontSize: 17 }}>資格と証明書類</h4>
          <p style={{ margin: 0, fontSize: 14 }}>資格はプロフィールで登録した内容（ご本人の申告）です。免許証などの写しを保存しても、資格が確認済みになるわけではありません。確認は応募先の園が行います。</p>
          {qualifications.length ? <ul className="hc-qualification-list">
            {qualifications.map((qualification) => {
              const evidenceTypes = evidenceTypesForQualification(qualification);
              return <li key={qualification} className="hc-qualification">
                <strong>{qualification}</strong>
                {evidenceTypes.length ? evidenceTypes.map((type) => {
                  const saved = documents.filter((document) => document.document_type === type).length;
                  return <div key={type} className="hc-qualification-evidence">
                    <span>{labels[type]}：{saved ? `保存済み（${saved}件）` : 'まだ保存されていません'}</span>
                    {!saved && <button type="button" className="secondary-button" disabled={busy} onClick={() => chooseFile({ documentType: type })}>
                      <Icon name="upload" size={16} /> {labels[type]}を追加
                    </button>}
                  </div>;
                }) : <div className="hc-qualification-evidence"><span>証明書類は「その他」として保存できます。</span></div>}
              </li>;
            })}
          </ul> : <p style={{ margin: 0, fontSize: 14 }}>プロフィールで資格を登録すると、ここに証明書類の保存状況が表示されます。</p>}
        </div>}
        {loading ? <div className="empty-state"><p>応募書類を読み込んでいます。</p></div> : documents.length ? (
          <div className="doc-vault-list">
            {documents.map((document) => <article key={document.id} className="doc-vault-item">
              <button type="button" className="doc-vault-open" onClick={() => void open(document)}>
                <span className="doc-vault-icon"><Icon name="file" size={20} /></span>
                <span className="doc-vault-text">
                  <strong>{labels[document.document_type]}{document.is_default && <span className="doc-vault-default">応募時に使用</span>}</strong>
                  <small>{document.title}{document.file_size ? ` ・ ${formatBytes(document.file_size)}` : ''}</small>
                </span>
              </button>
              <div className="doc-vault-actions">
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
