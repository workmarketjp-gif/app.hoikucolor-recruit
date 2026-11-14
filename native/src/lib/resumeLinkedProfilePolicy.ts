/** Use Web /resume's declared-qualification catalogue, not document verification. */
export const RESUME_PROFILE_QUALIFICATION_OPTIONS = [
  '保育士', '幼稚園教諭', '保育教諭', '看護師', '准看護師',
  '栄養士', '管理栄養士', '調理師', '子育て支援員', '普通自動車第一種運転免許',
] as const;
export const RESUME_PROFILE_QUALIFICATION_LIMIT = 50;

/** Preserve existing unknown qualifications, and discard an acquisition date only when its qualification is removed. */
export function setResumeQualification(
  selected: readonly string[],
  acquisitionDates: Readonly<Record<string, string>>,
  rawName: string,
  enabled: boolean,
): { qualifications: string[]; acquisitionDates: Record<string, string> } {
  const name = rawName.trim();
  if (!name || name.length > 100) throw new Error('資格名は1〜100文字で入力してください。');
  const current = [...new Set(selected)];
  if (enabled && !current.includes(name) && current.length >= RESUME_PROFILE_QUALIFICATION_LIMIT) {
    throw new Error('資格は50件まで登録できます。');
  }
  const qualifications = enabled
    ? (current.includes(name) ? current : [...current, name])
    : current.filter((value) => value !== name);
  // Web /resume retains acquisition dates only for qualifications still selected.
  const nextAcquisitionDates = Object.fromEntries(
    Object.entries(acquisitionDates).filter(([key]) => qualifications.includes(key)),
  );
  return { qualifications, acquisitionDates: nextAcquisitionDates };
}


/** Commit against the latest résumé draft, not a captured render of another field. */
export function updateResumeQualificationAcquiredDate(
  current: Record<string, string>, selected: readonly string[], rawName: string, value: string | null,
): Record<string, string> {
  const name = rawName.trim();
  // A picker opened before a qualification was removed must not revive its date.
  if (!name || !selected.includes(name) || (current[name] ?? null) === value) return current;
  const next = { ...current };
  if (value) next[name] = value;
  else delete next[name];
  return next;
}

/** Removing a qualification removes only dates no longer owned by a selected qualification. */
export function pruneResumeQualificationAcquiredDates(
  current: Record<string, string>, selected: readonly string[],
): Record<string, string> {
  const allowed = new Set(selected);
  if (Object.keys(current).every((name) => allowed.has(name))) return current;
  return Object.fromEntries(Object.entries(current).filter(([name]) => allowed.has(name)));
}

/** Same normalization for text input and Web's optional/null profile fields. */
export function resumeOptionalProfileText(value: string): string | null {
  return value.length ? value : null;
}
