export function isDocumentPickerCacheUriWithinDirectory(uri: unknown, cacheDirectoryUri: string): boolean {
  if (typeof uri !== 'string' || typeof cacheDirectoryUri !== 'string' ||
      !uri.startsWith('file:///') || !cacheDirectoryUri.startsWith('file:///')) return false;
  const prefix = cacheDirectoryUri.endsWith('/') ? cacheDirectoryUri : cacheDirectoryUri + '/';
  if (!uri.startsWith(prefix)) return false;
  const relative = uri.slice(prefix.length);
  if (!relative || /[?#\\\u0000-\u001f\u007f]/.test(relative)) return false;
  return relative.split('/').every((component) => {
    if (!component) return false;
    let decoded: string;
    try { decoded = decodeURIComponent(component); } catch { return false; }
    return decoded !== '.' && decoded !== '..' &&
      !/[\/\\%?#\u0000-\u001f\u007f]/.test(decoded);
  });
}
