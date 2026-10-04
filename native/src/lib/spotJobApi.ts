import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SpotJobListing = {
  job_id: string;
  facility_id: string;
  facility_name: string;
  facility_type: string | null;
  prefecture: string | null;
  city: string | null;
  address: string | null;
  title: string;
  description: string;
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  hourly_rate: number;
  required_count: number;
  confirmed_count: number;
  available_count: number;
  required_qualification: string | null;
  age_group_or_class: string | null;
  facility_message: string | null;
  published_at: string | null;
  closing_at: string | null;
  application_id: string | null;
  application_status: string | null;
};

export type SpotAssignment = {
  assignment_id: string;
  application_id: string;
  job_id: string;
  facility_id: string;
  facility_name: string;
  facility_type: string | null;
  prefecture: string | null;
  city: string | null;
  address: string | null;
  title: string;
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  hourly_rate: number;
  assignment_status: 'confirmed' | 'cancelled' | 'completed' | 'no_show' | string;
  confirmed_at: string;
};

function assertUuid(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`${label}を確認できませんでした。`);
  }
}

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label}を確認できませんでした。`);
  }
}

function parseSpotJobs(value: unknown): SpotJobListing[] {
  if (!Array.isArray(value)) throw new Error('スポット求人を確認できませんでした。');
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('スポット求人を確認できませんでした。');
    const row = raw as Record<string, unknown>;
    assertUuid(row.job_id, 'スポット求人ID');
    assertUuid(row.facility_id, '施設ID');
    if (typeof row.facility_name !== 'string' || typeof row.title !== 'string' || typeof row.work_date !== 'string' || typeof row.start_time !== 'string' || typeof row.end_time !== 'string') {
      throw new Error('スポット求人を確認できませんでした。');
    }
    assertFiniteNumber(row.break_minutes, '休憩時間');
    assertFiniteNumber(row.hourly_rate, '時給');
    assertFiniteNumber(row.required_count, '募集人数');
    assertFiniteNumber(row.confirmed_count, '確定人数');
    assertFiniteNumber(row.available_count, '残り枠');
    if (row.application_id != null) assertUuid(row.application_id, '応募ID');
    return row as unknown as SpotJobListing;
  });
}

function parseAssignments(value: unknown): SpotAssignment[] {
  if (!Array.isArray(value)) throw new Error('スポット勤務を確認できませんでした。');
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('スポット勤務を確認できませんでした。');
    const row = raw as Record<string, unknown>;
    assertUuid(row.assignment_id, '勤務ID');
    assertUuid(row.application_id, '応募ID');
    assertUuid(row.job_id, '求人ID');
    assertUuid(row.facility_id, '施設ID');
    if (typeof row.facility_name !== 'string' || typeof row.title !== 'string' || typeof row.work_date !== 'string' || typeof row.start_time !== 'string' || typeof row.end_time !== 'string' || typeof row.assignment_status !== 'string' || typeof row.confirmed_at !== 'string') {
      throw new Error('スポット勤務を確認できませんでした。');
    }
    assertFiniteNumber(row.break_minutes, '休憩時間');
    assertFiniteNumber(row.hourly_rate, '時給');
    return row as unknown as SpotAssignment;
  });
}

export async function listSpotJobs(client: SupabaseClient): Promise<SpotJobListing[]> {
  const { data, error } = await client.rpc('hc_jobseeker_list_spot_jobs');
  if (error) throw error;
  return parseSpotJobs(data);
}

export async function listMySpotAssignments(client: SupabaseClient): Promise<SpotAssignment[]> {
  const { data, error } = await client.rpc('hc_jobseeker_list_my_spot_assignments');
  if (error) throw error;
  return parseAssignments(data);
}

export function isSpotAssignmentId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}