import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20261101221341_hc_poppy_public_recruitment_content_v1.sql', import.meta.url),
  'utf8',
);

for (const required of [
  "h.status = 'published'",
  'h.closing_at is null or h.closing_at >= now()',
  'm.is_published',
  "m.recruitment_status = '募集中'",
  "l.status = 'active'",
  'x.is_published',
  'x.is_enabled',
  "s.section_key = 'section_director_message'",
  "s.section_key = 'section_photos'",
  "s.section_key = 'section_features'",
  "s.section_key = 'section_staff_voices'",
  "set search_path = ''",
  "to anon, authenticated",
  "'hc_job_id', h.id",
  "'source_job_id', m.id",
  "'facility_id', h.facility_id",
  "'source_nursery_id', m.nursery_id",
]) {
  assert.ok(migration.includes(required), `missing public-content guard: ${required}`);
}

for (const forbidden of [
  "'email'",
  "'phone'",
  'admin_memo',
  'created_by',
  'billing_email',
]) {
  assert.ok(!migration.includes(forbidden), `private field leaked into contract: ${forbidden}`);
}

console.log('hc-poppy common content contract: ok');
