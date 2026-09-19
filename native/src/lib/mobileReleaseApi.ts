import type { SupabaseClient } from '@supabase/supabase-js';
import type { NativeReleaseIdentity } from './appIdentity';

export type MobileReleaseCompatibility = {
  configured: boolean;
  allowed: boolean;
  forceUpdate: boolean;
  recommendedUpdate: boolean;
  maintenanceMode: boolean;
  backendContractVersion: number | null;
  minimumClientContractVersion: number | null;
  minimumBuildNumber: number | null;
  latestBuildNumber: number | null;
  storeUrl: string | null;
  message: string | null;
};

function firstRow(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function nullableInteger(value: unknown): number | null {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error('MOBILE_RELEASE_INVALID_INTEGER');
  }
  return number;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`MOBILE_RELEASE_INVALID_${field.toUpperCase()}`);
  return value;
}

function trustedStoreUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const url = value.trim();
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function parseCompatibility(data: unknown): MobileReleaseCompatibility {
  const row = firstRow(data);
  if (!row) throw new Error('MOBILE_RELEASE_EMPTY_RESPONSE');

  return {
    configured: requiredBoolean(row.configured, 'configured'),
    allowed: requiredBoolean(row.allowed, 'allowed'),
    forceUpdate: requiredBoolean(row.force_update, 'force_update'),
    recommendedUpdate: requiredBoolean(row.recommended_update, 'recommended_update'),
    maintenanceMode: requiredBoolean(row.maintenance_mode, 'maintenance_mode'),
    backendContractVersion: nullableInteger(row.backend_contract_version),
    minimumClientContractVersion: nullableInteger(row.minimum_client_contract_version),
    minimumBuildNumber: nullableInteger(row.minimum_build_number),
    latestBuildNumber: nullableInteger(row.latest_build_number),
    storeUrl: trustedStoreUrl(row.store_url),
    message: typeof row.message === 'string' && row.message.trim() ? row.message.trim() : null,
  };
}

/**
 * Canonical Native app/backend compatibility check.
 *
 * Do not infer compatibility from HTTP success or duplicate release rules on-device.
 * The backend release policy is the source of truth; the Native client only supplies
 * its immutable platform/build/contract identity and validates the returned shape.
 */
export async function getMobileReleaseCompatibility(
  client: SupabaseClient,
  identity: NativeReleaseIdentity,
): Promise<MobileReleaseCompatibility> {
  const { data, error } = await client.rpc('hc_mobile_bootstrap_v1', {
    p_platform: identity.platform,
    p_build_number: identity.buildNumber,
    p_client_contract_version: identity.clientContractVersion,
  });
  if (error) throw error;
  return parseCompatibility(data);
}
