/**
 * Render only canonical source metadata of an imported saved job.
 * Web reference: src/components/JobCard.tsx (external source footer).
 * Dates without a timezone are accepted only in date-only ISO form;
 * an ambiguous datetime is not promoted to a "last verified" claim.
 */
export type SavedJobSourceFields = {
  is_external?: boolean;
  source_name?: string | null;
  source_job_id?: string | null;
  source_last_verified_at?: string | null;
};

export type SavedJobSourcePresentation = {
  provenance: string | null;
  lastVerified: string | null;
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i;

function japaneseDate(year: number, month: number, day: number): string {
  return `${year}年${month}月${day}日`;
}

function verifiedDate(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (ISO_DATE.test(trimmed)) {
    const parsed = Date.parse(`${trimmed}T00:00:00Z`);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== trimmed) return null;
    const [year, month, day] = trimmed.split('-').map(Number);
    return japaneseDate(year, month, day);
  }
  if (!ISO_WITH_ZONE.test(trimmed)) return null;
  // Date.parse normalizes impossible calendar dates (e.g. 2026-02-30).
  const day = trimmed.slice(0, 10);
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(utcMidnight) || new Date(utcMidnight).toISOString().slice(0, 10) !== day) return null;
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const local = new Date(parsed + JST_OFFSET_MS);
  if (!Number.isFinite(local.getTime())) return null;
  return japaneseDate(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
}

export function presentSavedJobSource(job: SavedJobSourceFields): SavedJobSourcePresentation {
  if (job.is_external !== true) return { provenance: null, lastVerified: null };
  const name = typeof job.source_name === 'string' ? job.source_name.trim() : '';
  if (!name) return { provenance: null, lastVerified: null };
  const identifier = typeof job.source_job_id === 'string' ? job.source_job_id.trim() : '';
  return {
    provenance: `出典：${name}${identifier ? `（求人番号 ${identifier}）` : ''}`,
    lastVerified: verifiedDate(job.source_last_verified_at),
  };
}
