/** Candidate Web /resume: the same allowed experience options and half-year precision. */
export const RESUME_CLASSROOM_OPTIONS = ['0歳児', '1歳児', '2歳児', '3歳児', '4歳児', '5歳児', 'フリー', '異年齢保育', '障害児保育'] as const;
export const RESUME_LEADERSHIP_OPTIONS = ['乳児リーダー', '幼児リーダー', '副主任', '主任', '園長', '施設長'] as const;
export const RESUME_LINKED_AUTOSAVE_DELAY_MS = 1200;

/** Blank means unspecified. Do not silently coerce invalid/negative values to zero. */
export function parseResumeExperienceYears(input: string): number | null {
  if (!input.trim()) return null;
  if (!/^\d+(?:\.\d+)?$/.test(input.trim())) throw new Error('経験年数は0〜80の数字で入力してください。');
  const years = Number(input.trim());
  if (!Number.isFinite(years) || years < 0 || years > 80 || years * 2 !== Math.floor(years * 2)) {
    throw new Error('経験年数は0〜80の範囲で0.5年単位で入力してください。');
  }
  return years;
}

/** Preserve unknown existing Web values; never fabricate a qualification or role. */
export function toggleResumeExperienceChoice(current: readonly string[], value: string): string[] {
  if (!value.trim()) return [...current];
  return current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
}

export function canAutosaveResumeLinkedData(context: {
  ownerKey: string | null;
  loadedOwner: string | null;
  privateAllowed: boolean;
  dirty: boolean;
  saving: boolean;
  paused: boolean;
}): boolean {
  return Boolean(context.ownerKey) && context.loadedOwner === context.ownerKey &&
    context.privateAllowed && context.dirty && !context.saving && !context.paused;
}
