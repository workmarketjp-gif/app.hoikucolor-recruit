/** Native editing rules for the Web /resume BasicStep HTML date and postal inputs. */
export const RESUME_POSTAL_CODE_MAX_LENGTH = 8;

/** Match Web's numeric/hyphen-only postal field; never persist pasted letters. */
export function normalizeResumePostalCodeInput(value: string): string | null {
  return value.replace(/[^0-9-]/g, '').slice(0, RESUME_POSTAL_CODE_MAX_LENGTH) || null;
}

/** Keep historical valid birth dates editable, including years before 1900. */
export function splitResumeBirthDate(value: string | null): { year: string; month: string; day: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  return match ? { year: match[1], month: match[2], day: match[3] } : { year: '', month: '', day: '' };
}

/** Web uses an ISO UTC max="today"; reject impossible calendar dates and future days before save. */
export function composeResumeBirthDate(
  year: string, month: string, day: string, maxUtcDate: string,
): string | null {
  if (!/^\d{4}$/.test(year) || year === '0000' || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) return null;
  const iso = [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(maxUtcDate) || iso > maxUtcDate) return null;
  const parsed = new Date(iso + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}
