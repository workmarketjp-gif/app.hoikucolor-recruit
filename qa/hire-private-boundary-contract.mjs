import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const migration = readFileSync(
  new URL('supabase/migrations/20260911115000_hc_hire_private_impl_execution_boundary_v4.sql', root),
  'utf8',
);
const normalized = migration.toLowerCase().replace(/\s+/g, ' ');

const required = [
  'create or replace function ho_private.hc_hire_application_canonical',
  'security definer',
  "v_actor text := ho_private.current_clerk_user_id()",
  'ho_private.recruitment_can_write(p_facility_id)',
  'return ho_private.hc_hire_application_impl',
  'revoke all on function ho_private.hc_hire_application_impl',
  'from public, anon, authenticated, service_role',
  'grant execute on function ho_private.hc_hire_application_impl',
  'to postgres',
  'create or replace function public.hc_hire_application',
  'security invoker',
  'select ho_private.hc_hire_application_canonical',
  'grant execute on function public.hc_hire_application',
  'to postgres, authenticated',
];

for (const marker of required) {
  if (!normalized.includes(marker.toLowerCase().replace(/\s+/g, ' '))) {
    throw new Error(`Hire private boundary contract missing: ${marker}`);
  }
}

if (/grant execute on function ho_private\.hc_hire_application_impl[\s\S]*to[^;]*authenticated/i.test(migration)) {
  throw new Error('Authenticated must never receive EXECUTE on raw hire implementation.');
}

if (/grant execute on function public\.hc_hire_application[\s\S]*to[^;]*anon/i.test(migration)) {
  throw new Error('Anonymous users must never receive EXECUTE on hire RPC.');
}

console.log('Hoiku Color hire private implementation boundary contract passed.');
