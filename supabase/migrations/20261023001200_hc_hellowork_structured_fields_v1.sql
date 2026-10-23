-- Production migration version: 20261023001200 (applied 2026-10-23 with the user's approval).
-- Production already has this migration. Repository sync must NOT re-apply it there.
--
-- Hello Work external jobs: structured annual holidays, occupation group, canonical prefecture.
--
-- Data contract for the 転職シミュレーター (see docs/career-data-contract.md):
--   annual_holidays_days   explicit annual holiday days only (never derived from 「週休2日制」 etc.)
--   annual_holidays_basis  'exact' (「120日」) | 'minimum' (「120日以上」)
--   annual_holidays_source 'hellowork_field' (the page's own 「年間休日数」 row) | 'holidays_text' |
--                          'description_text' | 'title_text'. The formal field always wins over text.
--   occupation_group       hoikushi | hoiku_kyoyu | yochien_kyoyu | hoiku_hojo | nurse | nutritionist | cook |
--                          director | childcare_support | child_instructor | multiple | unknown
--   occupation_groups      every group the posting title names (unknown => empty array)
-- Everything is derived by deterministic functions below from stored posting text; ambiguity
-- (ranges, 「約」, 「選択制」, conflicting numbers) yields NULL / unknown, never a guess.
-- The importer additionally stores the page's formal row in annual_holidays_field_text.
begin;

do $$
begin
  if to_regclass('public.hc_external_job_sources') is null
     or to_regclass('public.hc_external_job_public_feed') is null then
    raise exception 'HC_HW_STRUCTURE_PREREQUISITE_MISSING';
  end if;
end $$;

alter table public.hc_external_job_sources
  add column if not exists annual_holidays_field_text text,
  add column if not exists annual_holidays_days smallint,
  add column if not exists annual_holidays_basis text,
  add column if not exists annual_holidays_source text,
  add column if not exists occupation_group text,
  add column if not exists occupation_groups text[] not null default '{}'::text[],
  add column if not exists occupation_source text,
  add column if not exists structured_parser_version text;

alter table public.hc_external_job_sources
  drop constraint if exists hc_external_job_sources_annual_holidays_check,
  add constraint hc_external_job_sources_annual_holidays_check check (
    (annual_holidays_days is null and annual_holidays_basis is null and annual_holidays_source is null)
    or (annual_holidays_days between 50 and 200
        and annual_holidays_basis in ('exact', 'minimum')
        and annual_holidays_source in ('hellowork_field', 'holidays_text', 'description_text', 'title_text'))
  ),
  drop constraint if exists hc_external_job_sources_occupation_check,
  add constraint hc_external_job_sources_occupation_check check (
    occupation_group is null or occupation_group in (
      'hoikushi', 'hoiku_kyoyu', 'yochien_kyoyu', 'hoiku_hojo', 'nurse', 'nutritionist', 'cook',
      'director', 'childcare_support', 'child_instructor', 'multiple', 'unknown')
  );

-- ---------------------------------------------------------------- normalisation
create or replace function hc_private.hw_norm_v1(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    translate(coalesce(p_text, ''), '０１２３４５６７８９，．：～〜　', '0123456789,.:~~ '),
    '[ \t]+', '', 'g')
$$;

-- --------------------------------------------------------------- annual holidays
-- One text source → (days, basis) | ambiguous | none.
create or replace function hc_private.hw_annual_holidays_from_text_v1(p_text text)
returns table (days integer, basis text, ambiguous boolean)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := hc_private.hw_norm_v1(p_text);
  m text[];
  v_days integer[] := '{}';
  v_basis text[] := '{}';
  v_ambiguous boolean := false;
  v_n integer;
begin
  if v_text = '' then
    return query select null::integer, null::text, false;
    return;
  end if;

  -- 「年間休日120日」「年間休日数：120日以上」「年間休日は120日」. Only punctuation or the particles
  -- は/が may sit between the label and the number, so 「年間休日選択制（107日…」 never matches.
  for m in
    select regexp_matches(v_text, '年間休日(?:総?日?数)?(?:は|が|:|=|\[|【|（|\()?(\d{2,3})(日)?(以上|程度|前後|~|ほど)?', 'g')
  loop
    v_n := m[1]::integer;
    if m[2] is null or m[3] in ('程度', '前後', '~', 'ほど') or v_n < 50 or v_n > 200 then
      v_ambiguous := true;
    else
      v_days := v_days || v_n;
      v_basis := v_basis || case when m[3] = '以上' then 'minimum' else 'exact' end;
    end if;
  end loop;

  -- 「年間休日」 spelled with the number first: 「120日の年間休日」「125日以上の年間休日」
  for m in
    select regexp_matches(v_text, '(\d{2,3})日(以上)?の?年間休日', 'g')
  loop
    v_n := m[1]::integer;
    if v_n < 50 or v_n > 200 then
      v_ambiguous := true;
    else
      v_days := v_days || v_n;
      v_basis := v_basis || case when m[2] = '以上' then 'minimum' else 'exact' end;
    end if;
  end loop;

  -- 「約」「最低」「最大」 directly before the number, or any other qualifier that makes it non-literal.
  if v_text ~ '年間休日(?:総?日?数)?(?:は|が|:|=)?(約|最低|最大|平均|およそ|おおよそ|概ね|目安)\d' then
    v_ambiguous := true;
  end if;

  if v_ambiguous or cardinality(v_days) = 0 then
    return query select null::integer, null::text, v_ambiguous;
    return;
  end if;
  -- Several statements must agree exactly (same number and same basis).
  if (select count(distinct (d, b)) from unnest(v_days, v_basis) as t(d, b)) > 1 then
    return query select null::integer, null::text, true;
    return;
  end if;
  return query select v_days[1], v_basis[1], false;
end;
$$;

-- Formal row first, then text in the order holidays → description → title.
create or replace function hc_private.hw_annual_holidays_v1(
  p_field_text text, p_holidays text, p_description text, p_title text)
returns table (days smallint, basis text, source text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_field text := hc_private.hw_norm_v1(p_field_text);
  m text[];
  r record;
begin
  if v_field <> '' then
    m := regexp_match(v_field, '^(\d{2,3})日(以上)?$');
    if m is not null and m[1]::integer between 50 and 200 then
      return query select m[1]::smallint, case when m[2] is not null then 'minimum' else 'exact' end, 'hellowork_field'::text;
      return;
    end if;
  end if;

  select * into r from hc_private.hw_annual_holidays_from_text_v1(p_holidays);
  if r.days is not null then
    return query select r.days::smallint, r.basis, 'holidays_text'::text; return;
  end if;
  if r.ambiguous then return query select null::smallint, null::text, null::text; return; end if;

  select * into r from hc_private.hw_annual_holidays_from_text_v1(p_description);
  if r.days is not null then
    return query select r.days::smallint, r.basis, 'description_text'::text; return;
  end if;
  if r.ambiguous then return query select null::smallint, null::text, null::text; return; end if;

  select * into r from hc_private.hw_annual_holidays_from_text_v1(p_title);
  if r.days is not null then
    return query select r.days::smallint, r.basis, 'title_text'::text; return;
  end if;
  return query select null::smallint, null::text, null::text;
end;
$$;

-- ------------------------------------------------------------------- occupation
create or replace function hc_private.hw_occupation_groups_from_title_v1(p_title text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(g order by o), '{}'::text[])
  from (values
    (1, 'hoikushi', '保育士(?!補助|助手)'),
    (2, 'hoiku_kyoyu', '保育教諭'),
    (3, 'yochien_kyoyu', '幼稚園教諭|幼稚園教員|幼稚園の先生'),
    (4, 'hoiku_hojo', '保育補助|保育士補助|保育助手|保育アシスタント'),
    (5, 'nurse', '看護師|准看護師|看護職|看護スタッフ'),
    (6, 'nutritionist', '栄養士'),
    (7, 'cook', '調理師|調理員|調理補助|調理スタッフ|調理担当|給食調理|調理業務'),
    (8, 'director', '園長|施設長'),
    (9, 'childcare_support', '子育て支援員'),
    (10, 'child_instructor', '児童指導員|児童発達支援管理責任者')
  ) as t(o, g, re)
  where coalesce(p_title, '') ~ re
$$;

-- Required licences listed as 「<資格名> 必須」 (used only when the title names no role).
create or replace function hc_private.hw_occupation_groups_from_qualification_v1(p_text text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct g), '{}'::text[])
  from (
    select case
      when m[1] in ('保育士') then 'hoikushi'
      when m[1] = '幼稚園教諭' then 'yochien_kyoyu'
      when m[1] in ('看護師', '准看護師') then 'nurse'
      when m[1] in ('栄養士', '管理栄養士') then 'nutritionist'
      when m[1] = '調理師' then 'cook'
    end as g
    from regexp_matches(hc_private.hw_norm_v1(coalesce(p_text, '')), '(保育士|幼稚園教諭|准看護師|看護師|管理栄養士|栄養士|調理師)\n?必須', 'g') as m
  ) s
  where g is not null
$$;

create or replace function hc_private.hw_occupation_v1(p_title text, p_qualification text)
returns table (occupation_group text, occupation_groups text[], source text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_title text[] := hc_private.hw_occupation_groups_from_title_v1(p_title);
  v_qual text[];
begin
  if cardinality(v_title) = 1 then
    return query select v_title[1], v_title, 'title'::text; return;
  elsif cardinality(v_title) > 1 then
    return query select 'multiple'::text, v_title, 'title'::text; return;
  end if;
  v_qual := hc_private.hw_occupation_groups_from_qualification_v1(p_qualification);
  if cardinality(v_qual) = 1 then
    return query select v_qual[1], v_qual, 'qualification'::text; return;
  end if;
  return query select 'unknown'::text, '{}'::text[], null::text;
end;
$$;

-- ------------------------------------------------------------------- prefecture
-- 「：広島県」「（滋賀県」 (stray punctuation before the name) → 「広島県」「滋賀県」; a missing prefecture
-- is read from the address. Returns NULL when no canonical name is present anywhere.
create or replace function hc_private.hw_prefecture_v1(p_prefecture text, p_address text)
returns text
language sql
immutable
set search_path = ''
as $$
  select p from unnest(array[
    '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都',
    '神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府',
    '大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県',
    '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県']) as p
  where position(p in coalesce(p_prefecture, '')) > 0 or position(p in coalesce(p_address, '')) > 0
  order by (position(p in coalesce(p_prefecture, '')) = 0),
           case when position(p in coalesce(p_prefecture, '')) > 0 then position(p in p_prefecture)
                else position(p in p_address) end
  limit 1
$$;

-- ----------------------------------------------------------------------- trigger
create or replace function hc_private.hw_structure_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
  o record;
  v_pref text;
begin
  select * into h from hc_private.hw_annual_holidays_v1(new.annual_holidays_field_text, new.holidays, new.description, new.title);
  new.annual_holidays_days := h.days;
  new.annual_holidays_basis := h.basis;
  new.annual_holidays_source := h.source;

  select * into o from hc_private.hw_occupation_v1(new.title, new.required_qualification);
  new.occupation_group := o.occupation_group;
  new.occupation_groups := o.occupation_groups;
  new.occupation_source := o.source;

  v_pref := hc_private.hw_prefecture_v1(new.prefecture, new.address);
  if v_pref is not null then new.prefecture := v_pref; end if;

  new.structured_parser_version := 'hw-structure-v1';
  return new;
end;
$$;

revoke all on function hc_private.hw_structure_trigger_v1() from public, anon, authenticated, service_role;
revoke all on function hc_private.hw_norm_v1(text) from public, anon, authenticated, service_role;
revoke all on function hc_private.hw_annual_holidays_from_text_v1(text) from public, anon, authenticated, service_role;
revoke all on function hc_private.hw_annual_holidays_v1(text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function hc_private.hw_occupation_groups_from_title_v1(text) from public, anon, authenticated, service_role;
revoke all on function hc_private.hw_occupation_groups_from_qualification_v1(text) from public, anon, authenticated, service_role;
revoke all on function hc_private.hw_occupation_v1(text, text) from public, anon, authenticated, service_role;
revoke all on function hc_private.hw_prefecture_v1(text, text) from public, anon, authenticated, service_role;

drop trigger if exists hc_hw_structure_before_write on public.hc_external_job_sources;
create trigger hc_hw_structure_before_write
before insert or update on public.hc_external_job_sources
for each row execute function hc_private.hw_structure_trigger_v1();

-- ---------------------------------------------------------------------- self test
create or replace function hc_private.hw_structure_selftest_v1()
returns void
language plpgsql
set search_path = ''
as $$
declare
  r record;
  procedure_failed text;

  -- (text, expected days, expected basis, expected ambiguous)
  cases text[][] := array[
    array['年間休日123日', '123', 'exact', 'f'],
    array['年間休日１２３日（２０２５年度実績）', '123', 'exact', 'f'],
    array['年間休日125日以上', '125', 'minimum', 'f'],
    array['＼年間休日１２０日！夏休あり！完全週休２日！／', '120', 'exact', 'f'],
    array['年間休日数：107日', '107', 'exact', 'f'],
    array['年間休日は１２７日。日曜・祝日はもちろん', '127', 'exact', 'f'],
    array['１２０日の年間休日', '120', 'exact', 'f'],
    array['完全週休2日制 祝日 年末年始', null, null, 'f'],
    array['年間休日数は年によって変動する可能性あり', null, null, 'f'],
    array['年間休日数に誕生日休暇、夏期休暇含む。', null, null, 'f'],
    array['シフト制。年間休日選択制（１０７日、１１５日、１２５日）', null, null, 'f'],
    array['年間休日約120日', null, null, 't'],
    array['年間休日120日程度', null, null, 't'],
    array['年間休日120日〜125日', null, null, 't'],
    array['年間休日120日 年間休日115日', null, null, 't'],
    array['年間休日365日', null, null, 't'],
    array['年間休日120', null, null, 't'],
    array['月8日休み 週休二日制', null, null, 'f']
  ];
  i integer;
begin
  for i in 1 .. array_length(cases, 1) loop
    select * into r from hc_private.hw_annual_holidays_from_text_v1(cases[i][1]);
    if r.days is distinct from nullif(cases[i][2], '')::integer
       or r.basis is distinct from nullif(cases[i][3], '')
       or r.ambiguous is distinct from (cases[i][4] = 't') then
      raise exception 'HW_SELFTEST_HOLIDAYS_FAILED:%', cases[i][1];
    end if;
  end loop;

  -- formal field beats text; text order holidays > description > title; ambiguity stops the fallthrough
  select * into r from hc_private.hw_annual_holidays_v1('107日', '年間休日選択制（107日、115日、125日）', '年間休日120日', null);
  if r.days is distinct from 107::smallint or r.source is distinct from 'hellowork_field' then raise exception 'HW_SELFTEST_FORMAL'; end if;
  select * into r from hc_private.hw_annual_holidays_v1('１２０日以上', null, null, null);
  if r.days is distinct from 120::smallint or r.basis is distinct from 'minimum' then raise exception 'HW_SELFTEST_FORMAL_MIN'; end if;
  select * into r from hc_private.hw_annual_holidays_v1(null, '年間休日123日', '年間休日120日', null);
  if r.days is distinct from 123::smallint or r.source is distinct from 'holidays_text' then raise exception 'HW_SELFTEST_ORDER'; end if;
  select * into r from hc_private.hw_annual_holidays_v1(null, null, '【年間休日120日】療育', '保育士');
  if r.days is distinct from 120::smallint or r.source is distinct from 'description_text' then raise exception 'HW_SELFTEST_DESC'; end if;
  select * into r from hc_private.hw_annual_holidays_v1(null, '年間休日約118日', '年間休日120日', null);
  if r.days is not null then raise exception 'HW_SELFTEST_AMBIGUOUS_STOPS'; end if;
  select * into r from hc_private.hw_annual_holidays_v1('', '休日 日曜日，祝日 週休二日制', null, '保育士');
  if r.days is not null then raise exception 'HW_SELFTEST_NO_DERIVATION'; end if;

  -- occupation
  select * into r from hc_private.hw_occupation_v1('保育士', null);
  if r.occupation_group is distinct from 'hoikushi' then raise exception 'HW_SELFTEST_OCC_HOIKUSHI'; end if;
  select * into r from hc_private.hw_occupation_v1('保育士補助（パート）', null);
  if r.occupation_group is distinct from 'hoiku_hojo' then raise exception 'HW_SELFTEST_OCC_HOJO'; end if;
  select * into r from hc_private.hw_occupation_v1('保育教諭【ウェルビューいずみこども園】', null);
  if r.occupation_group is distinct from 'hoiku_kyoyu' then raise exception 'HW_SELFTEST_OCC_KYOYU'; end if;
  select * into r from hc_private.hw_occupation_v1('看護師（病院内）羽後牛島駅／病児保育園あすなろ', null);
  if r.occupation_group is distinct from 'nurse' then raise exception 'HW_SELFTEST_OCC_NURSE'; end if;
  select * into r from hc_private.hw_occupation_v1('保育士・幼稚園教諭（産休・育休代替）', null);
  if r.occupation_group is distinct from 'multiple' or r.occupation_groups <> array['hoikushi', 'yochien_kyoyu'] then raise exception 'HW_SELFTEST_OCC_MULTI'; end if;
  select * into r from hc_private.hw_occupation_v1('園の事務スタッフ', E'免許・資格名\n保育士\n必須\n社会福祉士\n必須');
  if r.occupation_group is distinct from 'hoikushi' or r.source is distinct from 'qualification' then raise exception 'HW_SELFTEST_OCC_QUAL'; end if;
  select * into r from hc_private.hw_occupation_v1('園の事務スタッフ', E'免許・資格名\n保育士\n必須\n看護師\n必須');
  if r.occupation_group is distinct from 'unknown' then raise exception 'HW_SELFTEST_OCC_QUAL_AMBIGUOUS'; end if;
  select * into r from hc_private.hw_occupation_v1('管理栄養士・栄養士', null);
  if r.occupation_group is distinct from 'nutritionist' then raise exception 'HW_SELFTEST_OCC_NUTR'; end if;
  select * into r from hc_private.hw_occupation_v1('調理員（給食）', null);
  if r.occupation_group is distinct from 'cook' then raise exception 'HW_SELFTEST_OCC_COOK'; end if;
  select * into r from hc_private.hw_occupation_v1('事務', null);
  if r.occupation_group is distinct from 'unknown' or cardinality(r.occupation_groups) <> 0 then raise exception 'HW_SELFTEST_OCC_UNKNOWN'; end if;

  -- prefecture
  if hc_private.hw_prefecture_v1('：広島県', null) is distinct from '広島県' then raise exception 'HW_SELFTEST_PREF_JUNK'; end if;
  if hc_private.hw_prefecture_v1(null, '〒381-0084 長野県長野市大字若槻') is distinct from '長野県' then raise exception 'HW_SELFTEST_PREF_ADDRESS'; end if;
  if hc_private.hw_prefecture_v1('東京都', '神奈川県横浜市') is distinct from '東京都' then raise exception 'HW_SELFTEST_PREF_PREFERS_FIELD'; end if;
  if hc_private.hw_prefecture_v1('京都府', null) is distinct from '京都府' then raise exception 'HW_SELFTEST_PREF_KYOTO'; end if;
  if hc_private.hw_prefecture_v1(null, '不明') is not null then raise exception 'HW_SELFTEST_PREF_NONE'; end if;
end;
$$;

revoke all on function hc_private.hw_structure_selftest_v1() from public, anon, authenticated, service_role;

select hc_private.hw_structure_selftest_v1();

-- -------------------------------------------------------------- public feed columns
-- Appended at the end so the existing column order (and every dependent query) is unchanged.
create or replace view public.hc_external_job_public_feed as
 SELECT id,
    source,
    source_job_id,
    source_url,
    organization_name,
    facility_name,
    facility_type,
    prefecture,
    city,
    address,
    title,
    description,
    employment_type,
    salary_type,
    salary_min,
    salary_max,
    salary_note,
    working_hours,
    holidays,
    required_qualification,
    benefits,
    number_of_positions,
    COALESCE(source_published_at, fetched_at) AS published_at,
    COALESCE(closing_at, expires_at) AS closing_at,
    last_verified_at,
    online_self_apply_allowed,
    annual_holidays_days,
    annual_holidays_basis,
    occupation_group,
    occupation_groups
   FROM hc_external_job_sources e
  WHERE source_status = 'active'::text AND public_republication_allowed = true AND claimed_job_id IS NULL AND last_verified_at >= (now() - '168:00:00'::interval) AND (expires_at IS NULL OR expires_at >= now()) AND (closing_at IS NULL OR closing_at >= now()) AND (EXISTS ( SELECT 1
           FROM hc_external_source_sync_control c
          WHERE c.source = e.source AND c.enabled = true AND c.publication_enabled = true));

-- --------------------------------------------------- career aggregate helper (#75)
drop function if exists hc_private.career_posted_jobs_v1();
create function hc_private.career_posted_jobs_v1()
returns table (
  id uuid, facility_name text, title text, prefecture text, employment_type text,
  occupation_group text, occupation_groups text[], salary_type text, salary_min integer, salary_max integer,
  annual_holidays_days integer, annual_holidays_basis text, is_external boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.facility_name, r.title, r.prefecture, r.employment_type,
         null::text, '{}'::text[], r.salary_type, r.salary_min, r.salary_max,
         null::integer, null::text, false
  from public.hc_jobseeker_job_feed r
  union all
  select e.id, e.facility_name, e.title, e.prefecture, e.employment_type,
         e.occupation_group, e.occupation_groups, e.salary_type, e.salary_min, e.salary_max,
         e.annual_holidays_days::integer, e.annual_holidays_basis, true
  from public.hc_external_job_public_feed e
$$;

revoke all on function hc_private.career_posted_jobs_v1() from public, anon, authenticated, service_role;


-- ----------------------------------------------- career aggregates read the structured data
-- Same signatures as #75. p_occupation now filters on any group the posting names
-- (`'hoikushi' = any (occupation_groups)`); annual holidays come from the verified columns.
create or replace function public.hc_jobseeker_salary_market_v1(
  p_prefecture text default null,
  p_employment_type text default null,
  p_occupation text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_pref text := nullif(btrim(p_prefecture), '');
  v_emp text := nullif(btrim(p_employment_type), '');
  v_occ text := nullif(btrim(p_occupation), '');
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;

  with pop as (select * from hc_private.career_posted_jobs_v1()),
  scoped as (
    select * from pop
    where (v_pref is null or prefecture = v_pref)
      and (v_emp is null or employment_type = v_emp)
      and (v_occ is null or v_occ = any (occupation_groups))
  ),
  monthly as (
    select * from scoped
    where salary_type = 'monthly' and salary_min between 100000 and 1000000
  ),
  stats as (
    select count(*) as n,
      round(percentile_cont(0.25) within group (order by salary_min))::integer as q1,
      round(percentile_cont(0.5) within group (order by salary_min))::integer as median,
      round(percentile_cont(0.75) within group (order by salary_min))::integer as q3,
      min(salary_min) as lo, max(salary_min) as hi
    from monthly
  ),
  hist as (
    select (salary_min / 20000) * 20000 as bin_from, count(*) as c
    from monthly group by 1
  )
  select jsonb_build_object(
    'scope', jsonb_build_object('prefecture', v_pref, 'employment_type', v_emp, 'occupation', v_occ),
    'as_of', now(),
    'population', jsonb_build_object(
      'total_count', (select count(*) from pop),
      'scope_count', (select count(*) from scoped),
      'monthly_count', (select n from stats),
      'not_monthly_count', (select count(*) from scoped where salary_type is distinct from 'monthly'),
      'occupation_verified_count', (select count(*) from scoped where occupation_group is not null and occupation_group <> 'unknown'),
      'implausible_count', (select count(*) from scoped where salary_type = 'monthly'
                              and (salary_min is null or salary_min not between 100000 and 1000000))
    ),
    'monthly_lower_bound', (
      select case when s.n >= 5 then jsonb_build_object(
        'count', s.n, 'median', s.median, 'q1', s.q1, 'q3', s.q3, 'min', s.lo, 'max', s.hi,
        'histogram', (select jsonb_agg(jsonb_build_object('from', h.bin_from, 'to', h.bin_from + 20000, 'count', h.c)
                                       order by h.bin_from) from hist h)
      ) end
      from stats s
    ),
    'occupations', coalesce((select jsonb_agg(jsonb_build_object('group', x.g, 'count', x.c) order by x.c desc, x.g)
                             from (select g, count(*) as c from scoped, unnest(case when cardinality(occupation_groups) = 0 then array['unknown'] else occupation_groups end) as g
                                   group by g) x), '[]'::jsonb),
    'holidays', jsonb_build_object(
      'scope_count', (select count(*) from scoped),
      'verified_count', (select count(*) from scoped where annual_holidays_days is not null)
    ),
    'facets', jsonb_build_object(
      'coverage', coalesce((select jsonb_agg(jsonb_build_object('prefecture', x.prefecture, 'count', x.c) order by x.prefecture)
                            from (select prefecture, count(*) as c from pop where prefecture is not null group by 1) x), '[]'::jsonb),
      'employment_types', coalesce((select jsonb_agg(x.employment_type order by x.employment_type)
                                    from (select distinct employment_type from pop where employment_type is not null) x), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.hc_jobseeker_salary_market_v1(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_salary_market_v1(text, text, text) to authenticated;

-- Scenario filters. Only posted values are compared:
--   keep-income    posted upper bound reaches the line (reach says whether the lower bound already does)
--   more-holidays  reaches the line AND verified annual holidays exceed the floor; postings with
--                  unverified holidays are counted in unknown_holidays, never ranked
--   balance        postings with verified holidays, ranked inside the same pool by a weighted
--                  percentile of lower-bound pay and holidays (weight 100 = pay only)
create or replace function public.hc_jobseeker_career_scenario_jobs_v1(
  p_scenario text,
  p_prefecture text default null,
  p_employment_type text default null,
  p_salary_line integer default null,
  p_holiday_floor integer default null,
  p_salary_weight integer default 50,
  p_limit integer default 5,
  p_occupation text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := nullif((select auth.jwt()) ->> 'sub', '');
  v_pref text := nullif(btrim(p_prefecture), '');
  v_emp text := nullif(btrim(p_employment_type), '');
  v_occ text := nullif(btrim(p_occupation), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 20));
  v_weight numeric := greatest(0, least(coalesce(p_salary_weight, 50), 100)) / 100.0;
  v_total integer;
  v_unknown integer := 0;
  v_known integer;
  v_afford integer;
  v_jobs jsonb;
begin
  if v_actor is null then
    raise exception 'HC_JOBSEEKER_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_scenario not in ('keep-income', 'more-holidays', 'balance') then
    raise exception 'HC_CAREER_INVALID_SCENARIO' using errcode = '22023';
  end if;
  if p_scenario <> 'balance' and (p_salary_line is null or p_salary_line < 0 or p_salary_line > 2000000) then
    return jsonb_build_object('ready', false, 'missing', 'salary_line');
  end if;

  with base as (
    select p.id, p.facility_name, p.title, p.prefecture, p.employment_type, p.salary_min,
           greatest(p.salary_min, coalesce(p.salary_max, p.salary_min)) as salary_max,
           p.annual_holidays_days, p.annual_holidays_basis
    from hc_private.career_posted_jobs_v1() p
    where p.salary_type = 'monthly' and p.salary_min between 100000 and 1000000
      and (v_pref is null or p.prefecture = v_pref)
      and (v_emp is null or p.employment_type = v_emp)
      and (v_occ is null or v_occ = any (p.occupation_groups))
  ),
  afford as (select * from base where p_scenario = 'balance' or salary_max >= p_salary_line),
  known as (select * from afford where annual_holidays_days is not null),
  scored as (
    select k.*, percent_rank() over (order by salary_min) as sal,
           percent_rank() over (order by annual_holidays_days) as hol
    from known k
  ),
  matched as (
    select id, facility_name, title, prefecture, employment_type, salary_min, salary_max,
           annual_holidays_days, annual_holidays_basis, v_weight * sal + (1 - v_weight) * hol as score
    from scored where p_scenario = 'balance'
    union all
    select id, facility_name, title, prefecture, employment_type, salary_min, salary_max,
           annual_holidays_days, annual_holidays_basis, null
    from afford where p_scenario = 'keep-income'
    union all
    select id, facility_name, title, prefecture, employment_type, salary_min, salary_max,
           annual_holidays_days, annual_holidays_basis, null
    from known
    where p_scenario = 'more-holidays' and (p_holiday_floor is null or annual_holidays_days > p_holiday_floor)
  ),
  ranked as (
    select m.*, row_number() over (order by
        case when p_scenario = 'balance' then score end desc nulls last,
        case when p_scenario = 'more-holidays' then annual_holidays_days end desc nulls last,
        salary_min desc, id) as ord
    from matched m
  )
  select
    (select count(*) from matched),
    (select count(*) from known),
    (select count(*) from afford),
    coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'facility_name', r.facility_name, 'title', r.title, 'prefecture', r.prefecture,
        'employment_type', r.employment_type, 'salary_min', r.salary_min, 'salary_max', r.salary_max,
        'annual_holidays_days', r.annual_holidays_days, 'annual_holidays_basis', r.annual_holidays_basis,
        'reach', case when p_scenario = 'balance' or p_salary_line is null or r.salary_min >= p_salary_line
                      then 'lower-bound' else 'upper-bound-only' end
      ) order by r.ord) from ranked r where r.ord <= v_limit), '[]'::jsonb)
  into v_total, v_known, v_afford, v_jobs;

  v_unknown := case when p_scenario = 'keep-income' then 0 else v_afford - v_known end;
  if p_scenario = 'balance' and v_known < 5 then
    return jsonb_build_object('ready', false, 'missing', 'verified_holidays', 'unknown_holidays', v_unknown);
  end if;

  return jsonb_build_object('ready', true, 'total', v_total, 'unknown_holidays', v_unknown, 'jobs', v_jobs);
end;
$$;

revoke all on function public.hc_jobseeker_career_scenario_jobs_v1(text, text, text, integer, integer, integer, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.hc_jobseeker_career_scenario_jobs_v1(text, text, text, integer, integer, integer, integer, text) to authenticated;

commit;
