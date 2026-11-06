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

/** Same normalization for text input and Web's optional/null profile fields. */
export function resumeOptionalProfileText(value: string): string | null {
  return value.length ? value : null;
}
