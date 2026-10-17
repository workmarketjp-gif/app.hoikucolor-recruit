/**
 * The optional résumé photo never leaves the candidate's device on its own: it is kept
 * in this browser's IndexedDB and is only drawn into the PDF the candidate creates.
 * The picked image is re-encoded through a canvas (3:4 crop, 600×800 JPEG), which also
 * drops EXIF metadata such as GPS location.
 */
const DB_NAME = 'hc-resume-photo';
const STORE = 'photos';
const WIDTH = 600;
const HEIGHT = 800;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function loadResumePhoto(ownerId: string): Promise<Blob | null> {
  try {
    const value = await withStore<unknown>('readonly', (store) => store.get(ownerId));
    return value instanceof Blob ? value : null;
  } catch {
    return null;
  }
}

export async function saveResumePhoto(ownerId: string, photo: Blob) {
  try {
    await withStore('readwrite', (store) => store.put(photo, ownerId));
    return true;
  } catch {
    // Private browsing can block IndexedDB; the photo still works for this visit.
    return false;
  }
}

export async function deleteResumePhoto(ownerId: string) {
  try {
    await withStore('readwrite', (store) => store.delete(ownerId));
  } catch {
    // Nothing stored.
  }
}

/** Center-crops to 3:4 and re-encodes as JPEG. */
export async function prepareResumePhoto(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    throw new Error('写真はJPEGまたはPNGの画像を選んでください。');
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('この画像は読み込めませんでした。JPEGまたはPNGの写真を選んでください。');
  }
  const target = WIDTH / HEIGHT;
  const ratio = bitmap.width / bitmap.height;
  const sw = ratio > target ? bitmap.height * target : bitmap.width;
  const sh = ratio > target ? bitmap.height : bitmap.width / target;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('写真を処理できませんでした。');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, WIDTH, HEIGHT);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) throw new Error('写真を処理できませんでした。');
  return blob;
}
