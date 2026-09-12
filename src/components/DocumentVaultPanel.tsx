import { useUser } from '@clerk/react';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { ScoutPrivacyPanel } from './ScoutPrivacyPanel';
import { ProfileMatchingPreferencesPanel } from './ProfileMatchingPreferencesPanel';
import {
  createJobseekerDocumentSignedUrl,
  deleteJobseekerDocument,
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

function formatBytes(value: number | null) {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentVaultPanel() {
  const { user } = useUser();
  const [documents, setDocuments] = useState<JobseekerDocument[]>([]);
  const [documentType, setDocumentType] = useState<JobseekerDocumentType>('resume');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      setDocuments(await listJobseekerDocuments());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '応募書類を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const upload = async (file: File) => {
    if (!user?.id) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const sameTypeExists = documents.some((item) => item.document_type === documentType);
      await uploadJobseekerDocument(user.id, documentType, file, { makeDefault: !sameTypeExists });
      await load();
      setNotice(`${labels[documentType]}を保存しました。応募時に何度でも再利用できます。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '書類を保存できませんでした。');
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
      setError(err instanceof Error ? err.message : '書類を開けませんでした。');
    }
  };

  const makeDefault = async (document: JobseekerDocument) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await setDefaultJobseekerDocument(document.id);
      await load();
      setNotice(`${labels[document.document_type]}の応募時に使う書類を変更しました。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '既定書類を変更できませんでした。');
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
      setError(err instanceof Error ? err.message : '書類を削除できませんでした。');
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
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} />
          <button className="secondary-button" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> {busy ? '処理中…' : '書類を追加'}
          </button>
        </div>
        <small>PDF・画像（JPEG / PNG）、1ファイル10MBまで。Hoiku Officeへの採用書類連携に対応する形式だけを保存できます。各種類の「応募時に使う」を1件選べます。</small>
        {error && <span className="form-error">{error}</span>}
        {notice && <span className="form-success">{notice}</span>}
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
                {!document.is_default && <button type="button" className="secondary-button" disabled={busy} onClick={() => void makeDefault(document)}>応募時に使う</button>}
                <button type="button" className="secondary-button" disabled={busy} onClick={() => void remove(document)}>削除</button>
              </div>
            </article>)}
          </div>
        ) : <div className="empty-state"><h3>保存した応募書類はまだありません</h3><p>履歴書や保育士証をここに保存すると、応募のたびにアップロードし直す必要がなくなります。</p></div>}
      </div>
    </section>
    <ProfileMatchingPreferencesPanel />
    <ScoutPrivacyPanel />
  </>;
}
