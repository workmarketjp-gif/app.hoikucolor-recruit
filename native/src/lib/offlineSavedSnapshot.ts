import { File, Paths } from 'expo-file-system';
import {
  type CandidateLocalStateSessionLease,
  withCandidateLocalStateWrite,
} from './candidateLocalStateSession';

export type SavedJobCardSnapshot = {
  id: string;
  title: string;
  facility_name: string;
  prefecture: string | null;
  city: string | null;
  employment_type: string | null;
};

export type OfflineSavedSnapshot = {
  savedJobIds: string[];
  jobs: SavedJobCardSnapshot[];
  capturedAt: string;
};

const PREFIX = 'hc_color_saved_snapshot_v1_';
const MAX_SAVED_IDS = 200;
const MAX_JOB_CARDS = 120;

function safeUserKey(userId: string) {
  if (!userId) throw new Error('AUTH_REQUIRED');
  const normalized = userId.replace(/[^A-Za-z0-9._-]/g, '_');
  return `${PREFIX}${normalized}.json`;
}

function snapshotFile(userId: string) {
  return new File(Paths.document, safeUserKey(userId));
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanNullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text || null;
}

function normalizeJobCards(raw: unknown): SavedJobCardSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, SavedJobCardSnapshot>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const id = cleanText(item.id);
    const title = cleanText(item.title);
    const facilityName = cleanText(item.facility_name);
    if (!id || !title || !facilityName) continue;
    byId.set(id, {
      id,
      title,
      facility_name: facilityName,
      prefecture: cleanNullableText(item.prefecture),
      city: cleanNullableText(item.city),
      employment_type: cleanNullableText(item.employment_type),
    });
  }
  return [...byId.values()].slice(-MAX_JOB_CARDS);
}

function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const value of raw) {
    const id = cleanText(value);
    if (id) seen.add(id);
  }
  return [...seen].slice(-MAX_SAVED_IDS);
}

function normalize(raw: unknown): OfflineSavedSnapshot {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    savedJobIds: normalizeIds(value.savedJobIds),
    jobs: normalizeJobCards(value.jobs),
    capturedAt: cleanText(value.capturedAt) || new Date(0).toISOString(),
  };
}

export async function loadOfflineSavedSnapshot(userId: string): Promise<OfflineSavedSnapshot> {
  const file = snapshotFile(userId);
  if (!file.exists) return normalize(null);
  try {
    return normalize(JSON.parse(await file.text()));
  } catch {
    return normalize(null);
  }
}

export async function persistOfflineSavedSnapshot(
  userId: string,
  patch: { savedJobIds?: string[]; jobs?: SavedJobCardSnapshot[] },
  lease: CandidateLocalStateSessionLease,
): Promise<OfflineSavedSnapshot> {
  if (lease.userId !== userId) throw new Error('CANDIDATE_LOCAL_STATE_OWNER_MISMATCH');
  return withCandidateLocalStateWrite(lease, async () => {
    const current = await loadOfflineSavedSnapshot(userId);
    const next = normalize({
      savedJobIds: patch.savedJobIds ?? current.savedJobIds,
      jobs: patch.jobs ?? current.jobs,
      capturedAt: new Date().toISOString(),
    });
    const file = snapshotFile(userId);
    if (!file.exists) file.create();
    file.write(JSON.stringify(next));
    return next;
  });
}

export async function clearOfflineSavedSnapshot(userId: string) {
  const file = snapshotFile(userId);
  if (file.exists) file.delete();
}
