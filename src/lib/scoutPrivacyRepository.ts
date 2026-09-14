import { supabase } from './supabase';

export type ScoutBlockedOrganization = {
  organization_id: string;
  organization_name: string;
  source: 'manual' | 'current_employer';
};

export type ScoutPrivacySettings = {
  scout_opt_in: boolean;
  manual_blocks: ScoutBlockedOrganization[];
  automatic_blocks: ScoutBlockedOrganization[];
  identity_fields_shared_before_consent: boolean;
};

export type ScoutBlockableOrganization = {
  organization_id: string;
  organization_name: string;
};

function client() {
  if (!supabase) throw new Error('Supabaseの接続設定がありません。');
  return supabase;
}

export async function getScoutPrivacySettings(): Promise<ScoutPrivacySettings> {
  const { data, error } = await client().rpc('hc_jobseeker_get_scout_privacy');
  if (error) throw error;
  const value = (data || {}) as Partial<ScoutPrivacySettings>;
  return {
    scout_opt_in: value.scout_opt_in === true,
    manual_blocks: Array.isArray(value.manual_blocks) ? value.manual_blocks : [],
    automatic_blocks: Array.isArray(value.automatic_blocks) ? value.automatic_blocks : [],
    identity_fields_shared_before_consent: value.identity_fields_shared_before_consent === true,
  };
}

export async function setScoutOptIn(enabled: boolean): Promise<boolean> {
  const { data, error } = await client().rpc('hc_jobseeker_set_scout_opt_in', { p_enabled: enabled });
  if (error) throw error;
  return data === true;
}

export async function searchScoutBlockableOrganizations(query: string): Promise<ScoutBlockableOrganization[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const { data, error } = await client().rpc('hc_jobseeker_search_blockable_organizations', {
    p_query: normalized,
    p_limit: 10,
  });
  if (error) throw error;
  return (data || []) as ScoutBlockableOrganization[];
}

export async function addScoutBlockedOrganization(organizationId: string): Promise<void> {
  const { error } = await client().rpc('hc_jobseeker_add_blocked_organization', {
    p_organization_id: organizationId,
  });
  if (error) throw error;
}

export async function removeScoutBlockedOrganization(organizationId: string): Promise<void> {
  const { error } = await client().rpc('hc_jobseeker_remove_blocked_organization', {
    p_organization_id: organizationId,
  });
  if (error) throw error;
}
