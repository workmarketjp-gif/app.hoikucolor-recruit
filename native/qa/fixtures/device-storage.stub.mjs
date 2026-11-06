// In-memory stand-ins for expo-file-system, expo-secure-store and expo-crypto (document/photo cache suite).
import { createHash } from 'node:crypto';
export const fsState = { secureUnavailable: false, files: new Map(), failDelete: new Set(), failSecureDelete: false, secure: new Map() };
export const Paths = { cache: { uri: 'file:///cache/' } };
export class File {
  constructor(base, name) { this.uri = name ? `${base.uri}${name}` : String(base); }
  get exists() { return fsState.files.has(this.uri); }
  create() { fsState.files.set(this.uri, ''); }
  write(data) { fsState.files.set(this.uri, data); }
  async text() { return fsState.files.get(this.uri); }
  delete() { if (!fsState.failDelete.has(this.uri)) fsState.files.delete(this.uri); }
}
export async function getItemAsync(k) { return fsState.secure.get(k) ?? null; }
export async function setItemAsync(k, v) { fsState.secure.set(k, v); }
export async function deleteItemAsync(k) { if (fsState.failSecureDelete) throw new Error('secure delete failed'); fsState.secure.delete(k); }
export const CryptoDigestAlgorithm = { SHA256: 'sha256' };
export async function digestStringAsync(alg, value) { return createHash(alg).update(value).digest('hex'); }
export async function isAvailableAsync() { return !fsState.secureUnavailable; }
export const randomUUID = () => globalThis.crypto.randomUUID();
