// Pure, dependency-free module shared by Web (src/lib) and Native (native/src/lib).
// The two copies must stay byte-identical (qa/jobseeker-qualification-documents-contract.mjs),
// and Node runs this file directly in qa/ contracts, so it imports nothing.

export type JobseekerDocumentType =
  | 'resume'
  | 'work_history'
  | 'nursery_teacher_license'
  | 'kindergarten_license'
  | 'registered_dietitian_license'
  | 'dietitian_license'
  | 'cook_license'
  | 'nurse_license'
  | 'assistant_nurse_license'
  | 'other';

/** The fields of a saved vault document that the apply step needs. */
export type ApplyDocumentLike = {
  id: string;
  document_type: JobseekerDocumentType;
  title: string;
  is_default: boolean;
  uploaded_at: string;
};

/** Display order used everywhere a jobseeker picks or sees a document type. */
export const DOCUMENT_TYPE_ORDER: JobseekerDocumentType[] = [
  'resume',
  'work_history',
  'nursery_teacher_license',
  'kindergarten_license',
  'registered_dietitian_license',
  'dietitian_license',
  'cook_license',
  'nurse_license',
  'assistant_nurse_license',
  'other',
];

export const DOCUMENT_TYPE_LABELS: Record<JobseekerDocumentType, string> = {
  resume: '履歴書',
  work_history: '職務経歴書',
  nursery_teacher_license: '保育士証',
  kindergarten_license: '幼稚園教諭免許状',
  registered_dietitian_license: '管理栄養士免許証',
  dietitian_license: '栄養士免許証',
  cook_license: '調理師免許証',
  nurse_license: '看護師免許証',
  assistant_nurse_license: '准看護師免許証',
  other: 'その他',
};

export function documentTypeLabel(type: string): string {
  return (DOCUMENT_TYPE_LABELS as Record<string, string>)[type] ?? '書類';
}

/**
 * Declared qualification (profile, self-reported) → the licence documents that
 * can serve as evidence for it. Exact names only: 「准看護師」 must not match
 * 「看護師」 and 「管理栄養士」 must not match 「栄養士」.
 * Saving a file is never verification; facilities check the document themselves.
 */
const QUALIFICATION_EVIDENCE: Record<string, JobseekerDocumentType[]> = {
  保育士: ['nursery_teacher_license'],
  幼稚園教諭: ['kindergarten_license'],
  保育教諭: ['nursery_teacher_license', 'kindergarten_license'],
  管理栄養士: ['registered_dietitian_license'],
  栄養士: ['dietitian_license'],
  調理師: ['cook_license'],
  看護師: ['nurse_license'],
  准看護師: ['assistant_nurse_license'],
};

export function evidenceTypesForQualification(qualification: string): JobseekerDocumentType[] {
  return QUALIFICATION_EVIDENCE[qualification.trim()] ?? [];
}

export type JobDocumentRequirementLevel = 'required' | 'optional' | 'requested_later' | 'not_applicable';

export type ApplyDocumentLevel = Exclude<JobDocumentRequirementLevel, 'not_applicable'>;

export const REQUIREMENT_LABELS: Record<ApplyDocumentLevel, string> = {
  required: '必須',
  optional: '任意',
  requested_later: '応募後に提出',
};

export type JobDocumentRequirement = {
  document_type: JobseekerDocumentType;
  requirement: JobDocumentRequirementLevel;
  note: string | null;
};

/** `configured: false` means the facility has not set anything for this job. */
export type JobDocumentRequirements = {
  configured: boolean;
  items: JobDocumentRequirement[];
};

export type ApplyDocumentRow<D extends ApplyDocumentLike = ApplyDocumentLike> = {
  type: JobseekerDocumentType;
  level: ApplyDocumentLevel;
  note: string | null;
  /** Saved vault documents of this type, default first, then newest. */
  candidates: D[];
};

export type ApplyDocumentSelection = Partial<Record<JobseekerDocumentType, string | null>>;

const REQUIREMENT_LEVELS = new Set<string>(['required', 'optional', 'requested_later', 'not_applicable']);

export function isKnownDocumentType(value: unknown): value is JobseekerDocumentType {
  return typeof value === 'string' && (DOCUMENT_TYPE_ORDER as string[]).includes(value);
}

/** Drops rows the server should never send (unknown types/levels, duplicates). */
export function normalizeRequirements(rows: unknown): JobDocumentRequirement[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const result: JobDocumentRequirement[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const { document_type, requirement, note } = row as Record<string, unknown>;
    if (!isKnownDocumentType(document_type) || typeof requirement !== 'string' || !REQUIREMENT_LEVELS.has(requirement)) continue;
    if (seen.has(document_type)) continue;
    seen.add(document_type);
    result.push({
      document_type,
      requirement: requirement as JobDocumentRequirementLevel,
      note: typeof note === 'string' && note.trim() ? note.trim() : null,
    });
  }
  return result;
}

function sortCandidates<D extends ApplyDocumentLike>(documents: D[]): D[] {
  return [...documents].sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at);
  });
}

/**
 * Rows shown in the apply step.
 * - Configured job: every requirement except 「不要」, in catalogue order.
 * - Not configured: the types the candidate already marked 「応募時に使う」, as optional,
 *   which is exactly what the pre-requirement apply flow sent.
 */
export function buildApplyDocumentRows<D extends ApplyDocumentLike>(
  requirements: JobDocumentRequirements,
  documents: D[],
): ApplyDocumentRow<D>[] {
  const byType = (type: JobseekerDocumentType) => sortCandidates(documents.filter((document) => document.document_type === type));
  if (!requirements.configured) {
    return DOCUMENT_TYPE_ORDER
      .filter((type) => documents.some((document) => document.document_type === type && document.is_default))
      .map((type) => ({ type, level: 'optional' as const, note: null, candidates: byType(type) }));
  }
  const byRequirement = new Map(requirements.items.map((item) => [item.document_type, item]));
  return DOCUMENT_TYPE_ORDER.flatMap((type) => {
    const item = byRequirement.get(type);
    if (!item || item.requirement === 'not_applicable') return [];
    return [{ type, level: item.requirement, note: item.note, candidates: byType(type) }];
  });
}

/**
 * Starting selection: the saved 「応募時に使う」 document of each type. A required
 * type with no default but at least one saved file starts with the newest one.
 * 「応募後に提出」 rows start empty: nothing is sent unless the candidate chooses to.
 */
export function initialApplySelection(rows: ApplyDocumentRow[]): ApplyDocumentSelection {
  const selection: ApplyDocumentSelection = {};
  for (const row of rows) {
    if (row.level === 'requested_later') { selection[row.type] = null; continue; }
    const preferred = row.candidates.find((document) => document.is_default)
      ?? (row.level === 'required' ? row.candidates[0] : undefined);
    selection[row.type] = preferred?.id ?? null;
  }
  return selection;
}

/** Required rows without a selected, still-existing document. Only these block submission. */
export function missingRequiredDocuments(rows: ApplyDocumentRow[], selection: ApplyDocumentSelection): JobseekerDocumentType[] {
  return rows
    .filter((row) => row.level === 'required')
    .filter((row) => {
      const id = selection[row.type];
      return !id || !row.candidates.some((document) => document.id === id);
    })
    .map((row) => row.type);
}

/** Document ids to send, one per type, only ids that belong to the row's candidates. */
export function selectedDocumentIds(rows: ApplyDocumentRow[], selection: ApplyDocumentSelection): string[] {
  return rows.flatMap((row) => {
    const id = selection[row.type];
    return id && row.candidates.some((document) => document.id === id) ? [id] : [];
  });
}

/** 「履歴書」「保育士証」 → 「履歴書」と「保育士証」 */
export function joinDocumentLabels(types: JobseekerDocumentType[]): string {
  return types.map((type) => `「${DOCUMENT_TYPE_LABELS[type]}」`).join('と');
}
