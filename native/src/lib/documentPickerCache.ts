import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';

const PICKER_CACHE_REGISTRY_KEY = 'hc.native.document-picker-cache.v1';
export const DOCUMENT_PICKER_CACHE_GENERATION_CHANGED = 'DOCUMENT_PICKER_CACHE_GENERATION_CHANGED';

type PendingPickerCacheRecord = {
  userId: string;
  uri: string;
};

/**
 * DocumentPicker returns through an OS boundary. A sign-out/account switch can
 * therefore begin while a stale picker promise is still suspended outside JS.
 * Keep a process-global generation so any purge invalidates picker launches that
 * started before that privacy boundary. A single queue serializes registry/file
 * mutation so a late registration cannot complete *after* the purge that was
 * supposed to remove it.
 */
let pickerCacheGeneration = 0;
let pickerCacheMutationTail: Promise<void> = Promise.resolve();

function normalizeUserId(userId: string) {
  const normalized = userId.trim();
  if (!normalized) throw new Error('ログインユーザーを確認できませんでした。');
  return normalized;
}

function normalizedCachePrefix() {
  const uri = Paths.cache.uri;
  return uri.endsWith('/') ? uri : `${uri}/`;
}

export function isPrivateDocumentPickerCacheUri(uri: string) {
  return typeof uri === 'string' && uri.startsWith(normalizedCachePrefix());
}

function assertPrivateDocumentPickerCacheUri(uri: string) {
  if (!isPrivateDocumentPickerCacheUri(uri)) {
    throw new Error('選択した書類を安全な一時領域で確認できませんでした。もう一度選択してください。');
  }
  return uri;
}

function parseRecord(raw: string | null): PendingPickerCacheRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingPickerCacheRecord>;
    if (typeof value.userId !== 'string' || !value.userId.trim() || typeof value.uri !== 'string') return null;
    if (!isPrivateDocumentPickerCacheUri(value.uri)) return null;
    return { userId: value.userId.trim(), uri: value.uri };
  } catch {
    return null;
  }
}

async function withPickerCacheMutation<T>(action: () => Promise<T>): Promise<T> {
  const previous = pickerCacheMutationTail;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  pickerCacheMutationTail = tail;

  await previous.catch(() => undefined);
  try {
    return await action();
  } finally {
    release();
    if (pickerCacheMutationTail === tail) pickerCacheMutationTail = Promise.resolve();
  }
}

/** Capture immediately before opening the OS picker. */
export function captureDocumentPickerCacheGeneration() {
  return pickerCacheGeneration;
}

function assertPickerGeneration(expectedGeneration: number) {
  if (
    !Number.isInteger(expectedGeneration) ||
    expectedGeneration < 0 ||
    expectedGeneration !== pickerCacheGeneration
  ) {
    throw new Error(DOCUMENT_PICKER_CACHE_GENERATION_CHANGED);
  }
}

export async function registerPendingDocumentPickerCache(
  userId: string,
  uri: string,
  expectedGeneration: number,
) {
  const ownerId = normalizeUserId(userId);
  const safeUri = assertPrivateDocumentPickerCacheUri(uri);

  return withPickerCacheMutation(async () => {
    assertPickerGeneration(expectedGeneration);

    const file = new File(safeUri);
    if (!file.exists) throw new Error('選択した書類の一時ファイルを確認できませんでした。');

    const existingRaw = await SecureStore.getItemAsync(PICKER_CACHE_REGISTRY_KEY);
    assertPickerGeneration(expectedGeneration);
    const existing = parseRecord(existingRaw);
    if (existing && (existing.userId !== ownerId || existing.uri !== safeUri)) {
      throw new Error('前回の応募書類の一時ファイルを整理中です。アプリを再起動してからもう一度お試しください。');
    }

    await SecureStore.setItemAsync(
      PICKER_CACHE_REGISTRY_KEY,
      JSON.stringify({ userId: ownerId, uri: safeUri } satisfies PendingPickerCacheRecord),
    );
    assertPickerGeneration(expectedGeneration);
  });
}

export async function consumePendingDocumentPickerCache(userId: string, expectedUri: string) {
  const ownerId = normalizeUserId(userId);
  const safeUri = assertPrivateDocumentPickerCacheUri(expectedUri);

  return withPickerCacheMutation(async () => {
    const record = parseRecord(await SecureStore.getItemAsync(PICKER_CACHE_REGISTRY_KEY));
    if (!record || record.userId !== ownerId || record.uri !== safeUri) {
      throw new Error('応募書類の一時ファイル登録を確認できませんでした。もう一度選択してください。');
    }

    const file = new File(safeUri);
    if (file.exists) file.delete();
    if (file.exists) {
      throw new Error('応募書類の一時ファイルを削除できませんでした。端末容量を確認してもう一度お試しください。');
    }
    await SecureStore.deleteItemAsync(PICKER_CACHE_REGISTRY_KEY);
  });
}

export function discardUnregisteredDocumentPickerCache(uri: string) {
  const safeUri = assertPrivateDocumentPickerCacheUri(uri);
  const file = new File(safeUri);
  if (file.exists) file.delete();
  if (file.exists) {
    throw new Error('応募書類の未登録一時ファイルを削除できませんでした。');
  }
}

export async function purgePendingDocumentPickerCache() {
  pickerCacheGeneration += 1;

  return withPickerCacheMutation(async () => {
    const raw = await SecureStore.getItemAsync(PICKER_CACHE_REGISTRY_KEY);
    if (!raw) return false;
    const record = parseRecord(raw);
    if (!record) {
      await SecureStore.deleteItemAsync(PICKER_CACHE_REGISTRY_KEY);
      return false;
    }

    const file = new File(record.uri);
    if (file.exists) file.delete();
    if (file.exists) {
      throw new Error('応募書類の一時ファイルを削除できませんでした。');
    }

    await SecureStore.deleteItemAsync(PICKER_CACHE_REGISTRY_KEY);
    return true;
  });
}
