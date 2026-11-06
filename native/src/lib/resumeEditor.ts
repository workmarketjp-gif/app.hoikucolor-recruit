/** Pure Web /resume editor rules reused by both Native platform renders. */
export const MAX_RESUME_EDUCATION = 20;
export const MAX_RESUME_EMPLOYMENT = 30;

export function moveResumeEntry<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const next = [...items];
  const target = index + delta;
  if (!Number.isInteger(index) || index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function canAppendResumeEntry(items: readonly unknown[], limit: number): boolean {
  return items.length < limit;
}

/** Web year selector uses 1950 through the current year plus six. */
export function composeResumeYearMonth(year: string, month: string, currentYear: number): string | null {
  if (!/^\d{4}$/.test(year) || !/^(0[1-9]|1[0-2])$/.test(month)) return null;
  const numericYear = Number(year);
  if (!Number.isInteger(currentYear) || numericYear < 1950 || numericYear > currentYear + 6) return null;
  return `${year}-${month}`;
}

export function resumeCurrentChange<T extends { is_current: boolean; end_ym: string | null }>(entry: T, checked: boolean): T {
  return { ...entry, is_current: checked, end_ym: checked ? null : entry.end_ym };
}

export function educationStatusChange<T extends { is_current: boolean; end_ym: string | null; education_status: string | null }>(entry: T, status: string | null): T {
  return { ...entry, education_status: status, is_current: status === '在学中', end_ym: status === '在学中' ? null : entry.end_ym };
}
