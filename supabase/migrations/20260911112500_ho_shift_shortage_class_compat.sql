create or replace function public.ho_shift_shortages_sync_compat()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'INSERT' then
    -- age_group is the legacy 0-5 enum. age_group_or_class can contain labels
    -- such as '3歳児' or a named class, so never copy arbitrary labels into age_group.
    if new.age_group_or_class is not null then
      if btrim(new.age_group_or_class) in ('0','1','2','3','4','5') then
        new.age_group := btrim(new.age_group_or_class);
      elsif new.age_group not in ('0','1','2','3','4','5') then
        new.age_group := null;
      end if;
    else
      new.age_group_or_class := new.age_group;
    end if;

    if new.required_staff_count is not null then new.required_staff := new.required_staff_count;
    else new.required_staff_count := new.required_staff;
    end if;
    if new.scheduled_staff_count is not null then new.assigned_staff := new.scheduled_staff_count;
    else new.scheduled_staff_count := new.assigned_staff;
    end if;
    if new.reason is not null then new.memo := new.reason;
    else new.reason := new.memo;
    end if;
  else
    if new.age_group is distinct from old.age_group then
      new.age_group_or_class := new.age_group;
    elsif new.age_group_or_class is distinct from old.age_group_or_class then
      if new.age_group_or_class is null then
        new.age_group := null;
      elsif btrim(new.age_group_or_class) in ('0','1','2','3','4','5') then
        new.age_group := btrim(new.age_group_or_class);
      else
        new.age_group := null;
      end if;
    end if;

    if new.required_staff is distinct from old.required_staff then
      new.required_staff_count := new.required_staff;
    elsif new.required_staff_count is distinct from old.required_staff_count then
      new.required_staff := new.required_staff_count;
    end if;
    if new.assigned_staff is distinct from old.assigned_staff then
      new.scheduled_staff_count := new.assigned_staff;
    elsif new.scheduled_staff_count is distinct from old.scheduled_staff_count then
      new.assigned_staff := new.scheduled_staff_count;
    end if;
    if new.memo is distinct from old.memo then
      new.reason := new.memo;
    elsif new.reason is distinct from old.reason then
      new.memo := new.reason;
    end if;
  end if;
  return new;
end;
$function$;
