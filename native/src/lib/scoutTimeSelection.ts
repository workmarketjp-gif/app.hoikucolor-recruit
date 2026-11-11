/** Local 24-hour picker state for Web's <input type="time">. Do not
 * confuse a draft selection with canonical server persistence. */
export type ScoutClock = Readonly<{ hour: number; minute: number }>;

export function readScoutClock(value: string | null): ScoutClock | null {
  if (value === null) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error('勤務可能時間の形式が正しくありません。');
  }
  return { hour: Number(value.slice(0, 2)), minute: Number(value.slice(3, 5)) };
}

export function writeScoutClock(hour: number, minute: number): string {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 ||
      !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error('勤務可能時間の形式が正しくありません。');
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
