-- Hoiku Color Native App — worker runtime v1.
--
-- Mirrors the existing hc-email-dispatch pattern (vault secret + service-role-only
-- authorization RPC + pg_cron -> pg_net invocation gated by a runtime flag):
--
-- - hc-native-push-dispatch      : sends queued jobseeker Push via Expo.
-- - hc-native-account-deletion   : executes candidate account deletion requests.
--
-- Each worker has its own random shared secret generated inside the database and
-- stored in Vault; the value never appears in SQL, logs or the repository. Both
-- runtime flags default to disabled, so applying this migration schedules jobs
-- that are no-ops until an explicit enable step.

begin;

do $baseline$
begin
  if to_regprocedure('public.hc_mobile_claim_push_batch_v1(text,integer)') is null
     or to_regprocedure('public.hc_jobseeker_claim_account_deletion_v2(text,integer)') is null then
    raise exception 'HC_NATIVE_WORKER_BACKEND_REQUIRED';
  end if;
  if to_regclass('hc_private.native_worker_runtime') is not null
     or to_regprocedure('public.hc_native_worker_authorize_v1(text,text)') is not null then
    raise exception 'HC_NATIVE_WORKER_RUNTIME_ALREADY_EXISTS';
  end if;
  if not exists (select 1 from pg_extension where extname='pg_net')
     or not exists (select 1 from pg_extension where extname='pg_cron')
     or not exists (select 1 from pg_extension where extname='supabase_vault') then
    raise exception 'HC_NATIVE_WORKER_EXTENSIONS_MISSING';
  end if;
end
$baseline$;

create table hc_private.native_worker_runtime (
  worker text primary key check (worker in ('push','account_deletion')),
  function_slug text not null unique,
  secret_name text not null unique,
  enabled boolean not null default false,
  last_dispatch_at timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now()
);

alter table hc_private.native_worker_runtime enable row level security;
revoke all on table hc_private.native_worker_runtime from public, anon, authenticated, service_role;

insert into hc_private.native_worker_runtime(worker, function_slug, secret_name, enabled)
values
  ('push', 'hc-native-push-dispatch', 'hc_native_push_worker_secret', false),
  ('account_deletion', 'hc-native-account-deletion', 'hc_native_account_deletion_worker_secret', false);

-- Generate each worker secret server-side so no value ever leaves the database.
do $secrets$
declare v_name text;
begin
  foreach v_name in array array['hc_native_push_worker_secret','hc_native_account_deletion_worker_secret'] loop
    if not exists (select 1 from vault.secrets where name = v_name) then
      perform vault.create_secret(
        encode(extensions.gen_random_bytes(32), 'hex'),
        v_name,
        'Hoiku Color Native worker shared secret (generated in-database)'
      );
    end if;
  end loop;
end
$secrets$;

-- Edge Functions call this with the service-role key to authenticate an inbound
-- worker invocation. Returns only booleans; never the secret.
create or replace function public.hc_native_worker_authorize_v1(
  p_worker text,
  p_secret text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_expected text;
begin
  select s.decrypted_secret
    into v_expected
    from hc_private.native_worker_runtime r
    join vault.decrypted_secrets s on s.name = r.secret_name
   where r.worker = p_worker
   order by s.updated_at desc
   limit 1;

  if nullif(v_expected,'') is null or nullif(p_secret,'') is null then
    return false;
  end if;
  return extensions.digest(v_expected, 'sha256') = extensions.digest(p_secret, 'sha256');
end;
$$;

revoke all on function public.hc_native_worker_authorize_v1(text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.hc_native_worker_authorize_v1(text,text)
  to service_role;

-- pg_cron entry point. No-op unless the worker is explicitly enabled.
create or replace function hc_private.run_native_worker_cron_v1(p_worker text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime hc_private.native_worker_runtime%rowtype;
  v_secret text;
  v_request_id bigint;
begin
  select * into v_runtime from hc_private.native_worker_runtime where worker = p_worker;
  if not found or not v_runtime.enabled then
    return null;
  end if;

  select s.decrypted_secret into v_secret
    from vault.decrypted_secrets s
   where s.name = v_runtime.secret_name
   order by s.updated_at desc
   limit 1;

  if coalesce(v_secret,'') = '' then
    update hc_private.native_worker_runtime
       set enabled = false, last_error_code = 'WORKER_SECRET_MISSING', updated_at = now()
     where worker = p_worker;
    return null;
  end if;

  select net.http_post(
    url := 'https://kcmmpjyngcysdfbumchk.supabase.co/functions/v1/' || v_runtime.function_slug,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-hc-worker-secret', v_secret
    ),
    body := '{}'::jsonb
  ) into v_request_id;

  update hc_private.native_worker_runtime
     set last_dispatch_at = now(), updated_at = now()
   where worker = p_worker;

  return v_request_id;
end;
$$;

revoke all on function hc_private.run_native_worker_cron_v1(text)
  from public, anon, authenticated, service_role;

select cron.schedule(
  'hc-native-push-dispatch',
  '* * * * *',
  $cron$select hc_private.run_native_worker_cron_v1('push');$cron$
);
select cron.schedule(
  'hc-native-account-deletion',
  '*/5 * * * *',
  $cron$select hc_private.run_native_worker_cron_v1('account_deletion');$cron$
);

commit;
