import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useCandidateSession } from '../lib/candidateSession';
import {
  describeDocumentError,
  listJobseekerDocuments,
  uploadJobseekerDocument,
  type JobseekerDocument,
  type JobseekerDocumentType,
} from '../lib/documentVaultRepository';
import {
  DOCUMENT_TYPE_LABELS,
  REQUIREMENT_LABELS,
  buildApplyDocumentRows,
  initialApplySelection,
  joinDocumentLabels,
  missingRequiredDocuments,
  selectedDocumentIds,
  type ApplyDocumentRow,
  type ApplyDocumentSelection,
  type JobDocumentRequirements,
} from '../lib/documentTypes';
import { getJobDocumentRequirements } from '../lib/jobDocumentRequirementRepository';
import { submitApplication, type JobseekerProfile } from '../lib/recruitRepository';
import { errorMessage } from '../lib/useResource';

type Props = {
  jobId: string;
  /** Normal jobs: applied with this profile through submitApplication (v2 RPC). */
  profile?: JobseekerProfile;
  onCancel?: () => void;
  onApplied?: (applicationId: string) => void;
  /**
   * Other application flows (the private recruitment test lane) reuse the same step:
   * where this job's requirements come from, and who submits the chosen document ids.
   */
  loadRequirements?: () => Promise<JobDocumentRequirements>;
  submitDocuments?: (documentIds: string[]) => void;
  /** True while the caller is still submitting through submitDocuments. */
  externalPending?: boolean;
};

/**
 * The step between 「応募する」 and the application being created: shows the documents this
 * job asks for, pre-selects saved 「応募時に使う」 files, lets the candidate upload a missing
 * one without leaving the job, and blocks only on documents the facility marked 必須.
 */
export function ApplyDocumentsStep({ jobId, profile, onCancel, onApplied, loadRequirements, submitDocuments, externalPending = false }: Props) {
  const { userId } = useCandidateSession();
  const [requirements, setRequirements] = useState<JobDocumentRequirements | null>(null);
  const [documents, setDocuments] = useState<JobseekerDocument[]>([]);
  const [selection, setSelection] = useState<ApplyDocumentSelection>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<JobseekerDocumentType | null>(null);
  const [uploadError, setUploadError] = useState<{ type: JobseekerDocumentType; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTypeRef = useRef<JobseekerDocumentType | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [nextRequirements, nextDocuments] = await Promise.all([
        loadRequirements ? loadRequirements() : getJobDocumentRequirements(jobId),
        listJobseekerDocuments(),
      ]);
      setRequirements(nextRequirements);
      setDocuments(nextDocuments);
      setSelection(initialApplySelection(buildApplyDocumentRows(nextRequirements, nextDocuments)));
    } catch (err) {
      setLoadError(describeDocumentError(err, '応募に使う書類を読み込めませんでした。もう一度お試しください。'));
    }
    // loadRequirements is read once per job; callers pass a stable function per job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(
    () => (requirements ? buildApplyDocumentRows(requirements, documents) : []),
    [requirements, documents],
  );
  const missing = useMemo(() => missingRequiredDocuments(rows, selection), [rows, selection]);
  const busy = submitting || externalPending || uploadingType !== null;

  const chooseFile = (type: JobseekerDocumentType) => {
    if (busy) return;
    uploadTypeRef.current = type;
    fileRef.current?.click();
  };

  const upload = async (type: JobseekerDocumentType, file: File) => {
    if (!userId) { setUploadError({ type, message: 'ログインユーザーを確認できませんでした。もう一度ログインしてください。' }); return; }
    setUploadingType(type); setUploadError(null); setSubmitError(null);
    try {
      const firstOfType = !documents.some((document) => document.document_type === type);
      const saved = await uploadJobseekerDocument(userId, type, file, { makeDefault: firstOfType });
      const nextDocuments = await listJobseekerDocuments();
      setDocuments(nextDocuments);
      setSelection((current) => ({ ...current, [type]: saved.id }));
    } catch (err) {
      setUploadError({ type, message: describeDocumentError(err, '書類を保存できませんでした。通信状況を確認して、もう一度お試しください。') });
    } finally {
      setUploadingType(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async () => {
    setTriedSubmit(true);
    if (missing.length || busy) return;
    const documentIds = selectedDocumentIds(rows, selection);
    if (submitDocuments) { submitDocuments(documentIds); return; }
    if (!profile) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const applicationId = await submitApplication(jobId, profile, { documentIds });
      onApplied?.(applicationId);
    } catch (err) {
      setSubmitError(errorMessage(err, '応募を送信できませんでした。通信状況を確認して、もう一度お試しください。'));
    } finally {
      setSubmitting(false);
    }
  };

  const configured = requirements?.configured === true;

  return <section className="hc-apply-docs" aria-labelledby={`apply-docs-${jobId}`}>
    <h4 id={`apply-docs-${jobId}`}>応募の前に、送る書類を確認してください</h4>
    <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={(event) => {
      const file = event.target.files?.[0];
      const type = uploadTypeRef.current;
      uploadTypeRef.current = null;
      if (file && type) void upload(type, file);
    }} />

    {loadError ? <div role="alert" className="hc-apply-docs-alert">
      <p className="form-error">{loadError}</p>
      <button type="button" className="secondary-button" onClick={() => void load()}>もう一度読み込む</button>
    </div> : !requirements ? <p role="status">この求人で必要な書類を確認しています…</p> : <>
      <p className="hc-apply-docs-lead">
        {configured
          ? '園がこの求人で指定している書類です。「必須」の書類がそろうと応募できます。'
          : 'この求人では、園から書類の指定はありません。保存済みの書類を一緒に送ることができます。'}
      </p>

      {rows.length ? <ul className="hc-apply-doc-list">
        {rows.map((row) => <ApplyDocumentRowView
          key={row.type}
          row={row}
          selectedId={selection[row.type] ?? null}
          onSelect={(id) => setSelection((current) => ({ ...current, [row.type]: id }))}
          onUpload={() => chooseFile(row.type)}
          uploading={uploadingType === row.type}
          disabled={busy}
          showMissing={triedSubmit && missing.includes(row.type)}
          uploadError={uploadError?.type === row.type ? uploadError.message : null}
        />)}
      </ul> : <p className="hc-apply-docs-empty">送る書類はありません。書類なしで応募できます。履歴書などは、応募後に応募管理から追加で提出することもできます。</p>}

      <p className="hc-apply-docs-note">選んだ書類は、この応募先の園にだけ提出用のコピーが共有されます。PDF・JPEG・PNG、1ファイル10MBまで。</p>
    </>}

    <div aria-live="polite" role="status">
      {uploadingType && <p>{DOCUMENT_TYPE_LABELS[uploadingType]}を保存しています。画面を閉じずにお待ちください。</p>}
    </div>
    {missing.length > 0 && requirements && <p className={triedSubmit ? 'form-error' : 'hc-apply-docs-hint'} role={triedSubmit ? 'alert' : undefined}>
      {joinDocumentLabels(missing)}はこの求人の応募に必要です。保存済みの書類を選ぶか、ここでアップロードしてください。
    </p>}
    {submitError && <p className="form-error" role="alert">{submitError}</p>}

    <div className={`hc-job-actions ${onCancel ? '' : 'is-single'}`}>
      {onCancel && <button type="button" className="secondary-button" onClick={onCancel} disabled={submitting}>戻る</button>}
      <button type="button" className="primary-button" onClick={() => void submit()} disabled={busy || !requirements || Boolean(loadError)} aria-disabled={missing.length > 0}>
        {submitting || externalPending ? '応募しています…' : 'この内容で応募する'}
      </button>
    </div>
  </section>;
}

function ApplyDocumentRowView({ row, selectedId, onSelect, onUpload, uploading, disabled, showMissing, uploadError }: {
  row: ApplyDocumentRow;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpload: () => void;
  uploading: boolean;
  disabled: boolean;
  showMissing: boolean;
  uploadError: string | null;
}) {
  const label = DOCUMENT_TYPE_LABELS[row.type];
  const groupName = `apply-doc-${row.type}`;
  return <li className={`hc-apply-doc ${showMissing ? 'is-missing' : ''}`}>
    <div className="hc-apply-doc-head">
      <strong>{label}</strong>
      <span className={`hc-apply-doc-level is-${row.level}`}>{REQUIREMENT_LABELS[row.level]}</span>
    </div>
    {row.note && <p className="hc-apply-doc-note">園からのメモ：{row.note}</p>}
    {row.level === 'requested_later' && <p className="hc-apply-doc-note">応募のあとで、園から提出をお願いされることがあります。今は送らなくても応募できます。</p>}

    {row.candidates.length > 0 ? <fieldset className="hc-apply-doc-options" disabled={disabled}>
      <legend className="hc-visually-hidden">{label}として送る書類</legend>
      {row.candidates.map((document) => <label key={document.id} className="hc-apply-doc-option">
        <input type="radio" name={groupName} checked={selectedId === document.id} onChange={() => onSelect(document.id)} />
        <span><span className="hc-apply-doc-title">{document.title}</span>{document.is_default && <small>応募時に使う書類</small>}</span>
      </label>)}
      {row.level !== 'required' && <label className="hc-apply-doc-option">
        <input type="radio" name={groupName} checked={!selectedId} onChange={() => onSelect(null)} />
        <span>{row.level === 'requested_later' ? '今は送らない' : '送らない'}</span>
      </label>}
    </fieldset> : <p className="hc-apply-doc-empty">{row.level === 'required' ? 'まだ保存されていません。この応募に必要です。' : 'まだ保存されていません。'}</p>}

    {uploadError && <p className="form-error" role="alert">{uploadError}</p>}
    <button type="button" className="secondary-button hc-apply-doc-upload" onClick={onUpload} disabled={disabled}>
      <Icon name="upload" size={16} /> {uploading ? '保存しています…' : row.candidates.length ? '別のファイルを追加' : `${label}を追加`}
    </button>
  </li>;
}
