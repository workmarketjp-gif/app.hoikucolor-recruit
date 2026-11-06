// Stub for the five physical-storage surfaces purged on sign-out. Each records calls and can be made to fail.
export const log = [];
export const fail = new Set();
export const delayMs = { value: 0 };
const run = async (name, arg) => {
  log.push([name, arg, 'start']);
  if (delayMs.value) await new Promise((r) => setTimeout(r, delayMs.value));
  if (fail.has(name)) throw new Error(`${name} failed`);
  log.push([name, arg, 'done']);
};
export const clearAllDurableMutations = (o) => run('durable-mutation-recovery', o);
export const purgePendingDocumentPickerCache = () => run('document-picker-cache');
export const purgeCachedResumePhoto = (o) => run('resume-photo-cache', o);
export const clearOfflineSavedJobs = (o) => run('saved-command-queue', o);
export const clearOfflineSavedSnapshot = (o) => run('saved-display-snapshot', o);
