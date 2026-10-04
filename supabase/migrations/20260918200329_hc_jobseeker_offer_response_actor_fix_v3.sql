create or replace function ho_private.hc_candidate_offer_response_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer_actor text := nullif(current_setting('hc.candidate_offer_actor', true), '');
  v_withdraw_actor text := nullif(current_setting('hc.candidate_withdrawal_actor', true), '');
  v_fields_changed boolean;
begin
  if old.source_type <> 'hoiku_color_jobseeker' then
    return new;
  end if;

  if old.status = 'offered'
     and new.status in ('new','reviewing','interview')
     and new.status is distinct from old.status then
    new.candidate_offer_response := null;
    new.candidate_offer_responded_at := null;
    new.candidate_offer_message := null;
  end if;

  v_fields_changed :=
    new.candidate_offer_response is distinct from old.candidate_offer_response
    or new.candidate_offer_responded_at is distinct from old.candidate_offer_responded_at
    or new.candidate_offer_message is distinct from old.candidate_offer_message;

  if v_fields_changed then
    if v_offer_actor is distinct from old.jobseeker_clerk_user_id
       and v_withdraw_actor is distinct from old.jobseeker_clerk_user_id then
      raise exception 'HC_CANDIDATE_OFFER_RESPONSE_RPC_REQUIRED'
        using errcode = '42501';
    end if;

    if new.candidate_offer_response = 'accepted' and new.status <> 'offered' then
      raise exception 'HC_OFFER_ACCEPTANCE_REQUIRES_OFFERED_STATUS'
        using errcode = '23514';
    end if;

    if new.candidate_offer_response = 'declined' and new.status <> 'withdrawn' then
      raise exception 'HC_OFFER_DECLINE_REQUIRES_WITHDRAWN_STATUS'
        using errcode = '23514';
    end if;
  end if;

  if new.status = 'hired'
     and old.status is distinct from 'hired'
     and coalesce(old.candidate_offer_response, new.candidate_offer_response, '') <> 'accepted' then
    raise exception 'HC_CANDIDATE_OFFER_ACCEPTANCE_REQUIRED'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function ho_private.hc_candidate_offer_response_guard()
  from public, anon, authenticated, service_role;
