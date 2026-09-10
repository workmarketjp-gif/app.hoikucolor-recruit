do $migration$
declare
  v_oid oid;
  v_def text;
  v_original text;
  v_old text := $old$
  if v_spot.shift_shortage_id is not null then
    select
      case
        when coalesce(nullif(btrim(ss.age_group_or_class),''), nullif(btrim(ss.age_group),'')) is not null then 'class'
        else 'free'
      end,
      coalesce(nullif(btrim(ss.age_group_or_class),''), nullif(btrim(ss.age_group),''))
    into v_shortage_role, v_shortage_age
    from public.ho_shift_shortages ss
    where ss.id=v_spot.shift_shortage_id
      and ss.organization_id=v_app.organization_id
      and ss.facility_id=v_app.facility_id;
  end if;
$old$;
  v_new text := $new$
  if v_spot.shift_shortage_id is not null then
    select
      case
        when coalesce(nullif(btrim(ss.age_group_or_class),''), nullif(btrim(ss.age_group),'')) is not null then 'class'
        else 'free'
      end,
      case
        when nullif(btrim(ss.age_group),'') in ('0','1','2','3','4','5') then btrim(ss.age_group)
        when nullif(btrim(ss.age_group_or_class),'') in ('0','1','2','3','4','5') then btrim(ss.age_group_or_class)
        when btrim(coalesce(ss.age_group_or_class,'')) ~ '^[0-5]歳' then left(btrim(ss.age_group_or_class),1)
        else null
      end
    into v_shortage_role, v_shortage_age
    from public.ho_shift_shortages ss
    where ss.id=v_spot.shift_shortage_id
      and ss.organization_id=v_app.organization_id
      and ss.facility_id=v_app.facility_id;
  end if;
$new$;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='ho_private' and p.proname='hc_confirm_spot_assignment_impl'
    and pg_get_function_identity_arguments(p.oid)='p_facility_id uuid, p_application_id uuid, p_break_minutes integer';
  if v_oid is null then raise exception 'hc_confirm_spot_assignment_impl not found'; end if;
  v_def := pg_get_functiondef(v_oid);
  v_original := v_def;
  v_def := replace(v_def, v_old, v_new);
  if v_def = v_original then raise exception 'expected spot shortage mapping block not found'; end if;
  execute v_def;
end;
$migration$;
