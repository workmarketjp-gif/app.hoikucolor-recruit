import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { getNativeReleaseIdentity } from './appIdentity';

const INSTALLATION_ID_KEY = 'hc.native.installation-id.v1';
const PUSH_BINDING_QUARANTINED = 'PUSH_BINDING_QUARANTINED';
const LOCAL_PUSH_PRESENTATION_PURGE_INCOMPLETE = 'LOCAL_PUSH_PRESENTATION_PURGE_INCOMPLETE';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let pushBindingGeneration = 0;
let pushBindingBlocked = false;
const pendingBinding = new Set<Promise<unknown>>();
const pendingPresentation = new Set<Promise<unknown>>();
const pendingCleanup = new Set<Promise<unknown>>();

function assertGeneration(generation: number) {
  if (pushBindingBlocked || generation !== pushBindingGeneration) {
    throw new Error(PUSH_BINDING_QUARANTINED);
  }
}

async function track<T>(bucket: Set<Promise<unknown>>, operation: (generation: number) => Promise<T>) {
  const generation = pushBindingGeneration;
  assertGeneration(generation);
  const promise = operation(generation);
  bucket.add(promise);
  try {
    return await promise;
  } finally {
    bucket.delete(promise);
  }
}

export function blockPushBindingOperations() {
  pushBindingBlocked = true;
  pushBindingGeneration += 1;
  return pushBindingGeneration;
}

export async function settlePushBindingOperations() {
  while (pendingBinding.size || pendingPresentation.size || pendingCleanup.size) {
    await Promise.allSettled([...pendingBinding, ...pendingPresentation, ...pendingCleanup]);
  }
}

export function unblockPushBindingOperations(expectedGeneration?: number) {
  if (expectedGeneration != null && expectedGeneration !== pushBindingGeneration) return false;
  pushBindingBlocked = false;
  return true;
}

export async function quiescePushBindingOperations() {
  const generation = blockPushBindingOperations();
  await settlePushBindingOperations();
  return generation;
}

export function isPushBindingQuarantinedError(error: unknown) {
  return String((error as { message?: unknown } | null)?.message ?? error ?? '').includes(PUSH_BINDING_QUARANTINED);
}

export async function setCandidateNotificationBadgeCount(count: number) {
  if (!Number.isInteger(count) || count < 0) throw new Error('INVALID_NOTIFICATION_BADGE_COUNT');
  return track(pendingPresentation, async (generation) => {
    const result = await Notifications.setBadgeCountAsync(count);
    assertGeneration(generation);
    return result;
  });
}

export async function clearCandidateLastNotificationResponse() {
  return track(pendingPresentation, async (generation) => {
    const result = await Notifications.clearLastNotificationResponseAsync();
    assertGeneration(generation);
    return result;
  });
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushRegistrationState =
  | { kind: 'registered'; authorized: true; installationId: string; badgeAllowed: boolean | null }
  | { kind: 'permission_denied'; authorized: false; installationId: string; canAskAgain: boolean }
  | { kind: 'unavailable'; authorized: false; reason: 'PHYSICAL_DEVICE_REQUIRED' }
  | { kind: 'error'; authorized: boolean; message: string };

export type JobseekerNotification = {
  id: string;
  application_id: string | null;
  notification_type: string;
  title: string;
  body: string;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
};

export async function listNotifications(client: SupabaseClient, limit = 50): Promise<JobseekerNotification[]> {
  const { data, error } = await client.rpc('hc_jobseeker_list_notifications', { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as JobseekerNotification[];
}

export async function getUnreadNotificationCount(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.rpc('hc_jobseeker_get_unread_notification_count_v1');
  if (error) throw error;
  const count = Number(data);
  if (!Number.isInteger(count) || count < 0) throw new Error('NOTIFICATION_UNREAD_COUNT_UNAVAILABLE');
  return count;
}

export async function markNotificationRead(client: SupabaseClient, notificationId: string) {
  const { error } = await client.rpc('hc_jobseeker_mark_notification_read', { p_notification_id: notificationId });
  if (error) throw error;
}

export async function markAllNotificationsRead(client: SupabaseClient) {
  const { error } = await client.rpc('hc_jobseeker_mark_all_notifications_read');
  if (error) throw error;
}

export async function resolveNotificationRoute(client: SupabaseClient, notificationId: string) {
  const { data, error } = await client.rpc('hc_jobseeker_resolve_notification_route_v1', {
    p_notification_id: notificationId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('NOTIFICATION_ROUTE_NOT_FOUND');
  return row as { route_key: string; route_params: Record<string, string>; notification_type: string };
}

export function nativeNotificationHref(route: { route_key: string; route_params: Record<string, string> }, navigationKey?: string) {
  const applicationId = route.route_params?.applicationId;
  const visitId = route.route_params?.visitId;
  const jobId = route.route_params?.jobId;
  const interviewId = route.route_params?.interviewId;
  if (route.route_key === 'visits') {
    if (!visitId) return '/visits';
    const query = new URLSearchParams({ visitId });
    if (jobId) query.set('jobId', jobId);
    return `/visits?${query.toString()}`;
  }
  if (applicationId && route.route_key === 'application_messages') {
    const query = new URLSearchParams({ focus: 'messages' });
    if (navigationKey) query.set('focusKey', navigationKey);
    return `/application/${applicationId}?${query.toString()}`;
  }
  if (applicationId && route.route_key === 'application_interview') {
    const query = new URLSearchParams({ focus: 'interview' });
    if (interviewId && UUID_PATTERN.test(interviewId)) query.set('interviewId', interviewId);
    if (navigationKey) query.set('focusKey', navigationKey);
    return `/application/${applicationId}?${query.toString()}`;
  }
  if (applicationId && route.route_key === 'application_detail') return `/application/${applicationId}`;
  return '/(tabs)/notifications';
}

async function getInstallationId() {
  const current = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (current) return current;
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(INSTALLATION_ID_KEY, id);
  return id;
}

function projectId() {
  const value = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
  if (!value || String(value).startsWith('SET_')) throw new Error('EAS_PROJECT_ID_REQUIRED');
  return String(value);
}

function permissionCanAskAgain(permission: any) {
  return permission?.canAskAgain !== false;
}

function permissionAuthorized(permission: any) {
  if (Platform.OS !== 'ios') return permission?.status === 'granted';
  const status = permission?.ios?.status;
  if (status == null) return permission?.status === 'granted';
  return [
    Notifications.IosAuthorizationStatus.AUTHORIZED,
    Notifications.IosAuthorizationStatus.PROVISIONAL,
    Notifications.IosAuthorizationStatus.EPHEMERAL,
  ].includes(status);
}

function badgeAllowed(permission: any): boolean | null {
  if (Platform.OS !== 'ios') return null;
  return typeof permission?.ios?.allowsBadge === 'boolean' ? permission.ios.allowsBadge : null;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Hoiku Color',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function registerInstallation(params: {
  client: SupabaseClient;
  installationId: string;
  pushToken: string | null;
  authorized: boolean;
  generation: number;
}) {
  assertGeneration(params.generation);
  const identity = getNativeReleaseIdentity();
  const { error } = await params.client.rpc('hc_mobile_register_installation_v1', {
    p_installation_id: params.installationId,
    p_platform: identity.platform,
    p_push_provider: 'expo',
    p_push_token: params.pushToken,
    p_app_version: identity.appVersion,
    p_build_number: identity.buildNumber,
    p_client_contract_version: identity.clientContractVersion,
    p_notifications_authorized: params.authorized,
    p_locale: null,
    p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
  });
  if (error) throw error;
}

export async function syncPushRegistration(params: {
  client: SupabaseClient;
  requestPermission: boolean;
  devicePushToken?: any;
}): Promise<PushRegistrationState> {
  return track(pendingBinding, async (generation) => {
    if (!Device.isDevice) return { kind: 'unavailable', authorized: false, reason: 'PHYSICAL_DEVICE_REQUIRED' };
    assertGeneration(generation);
    await ensureAndroidChannel();
    assertGeneration(generation);
    let permission = await Notifications.getPermissionsAsync();
    if (!permissionAuthorized(permission) && params.requestPermission && permissionCanAskAgain(permission)) {
      permission = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: false },
      });
    }
    assertGeneration(generation);
    const installationId = await getInstallationId();
    assertGeneration(generation);
    const authorized = permissionAuthorized(permission);
    if (!authorized) {
      await registerInstallation({ client: params.client, installationId, pushToken: null, authorized: false, generation });
      return {
        kind: 'permission_denied',
        authorized: false,
        installationId,
        canAskAgain: permissionCanAskAgain(permission),
      };
    }
    try {
      const token = (await Notifications.getExpoPushTokenAsync({
        projectId: projectId(),
        ...(params.devicePushToken ? { devicePushToken: params.devicePushToken } : {}),
      })).data;
      assertGeneration(generation);
      await registerInstallation({ client: params.client, installationId, pushToken: token, authorized: true, generation });
      return { kind: 'registered', authorized: true, installationId, badgeAllowed: badgeAllowed(permission) };
    } catch (error) {
      if (isPushBindingQuarantinedError(error)) throw error;
      return { kind: 'error', authorized: true, message: String((error as { message?: unknown })?.message ?? error) };
    }
  });
}

export function addPushTokenRotationListener(params: {
  client: SupabaseClient;
  onState?: (state: PushRegistrationState) => void;
}) {
  return Notifications.addPushTokenListener((devicePushToken: any) => {
    void syncPushRegistration({ client: params.client, requestPermission: false, devicePushToken })
      .then((state) => params.onState?.(state))
      .catch((error) => {
        if (!isPushBindingQuarantinedError(error)) throw error;
      });
  });
}

export async function revokePush(client: SupabaseClient) {
  const installationId = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (!installationId) return;
  const { error } = await client.rpc('hc_mobile_revoke_installation_v1', {
    p_installation_id: installationId,
  });
  if (error) throw error;
}

export async function quarantineLocalPushIdentity(
  expectedGeneration?: number,
  options: { requirePresentationCleanup?: boolean } = {},
) {
  if (expectedGeneration != null && expectedGeneration !== pushBindingGeneration) {
    return { unregistered: false, installationIdPreserved: true as const };
  }
  const promise = (async () => {
    let unregistered = false;
    try {
      await Notifications.unregisterForNotificationsAsync();
      unregistered = true;
    } catch {
      // New authenticated sessions re-register the stable installation id.
    }
    const results = await Promise.allSettled([
      Notifications.dismissAllNotificationsAsync(),
      Notifications.setBadgeCountAsync(0),
      Notifications.clearLastNotificationResponseAsync(),
    ]);
    if (options.requirePresentationCleanup && results.some((result) => result.status === 'rejected')) {
      throw new Error(LOCAL_PUSH_PRESENTATION_PURGE_INCOMPLETE);
    }
    return { unregistered, installationIdPreserved: true as const };
  })();
  pendingCleanup.add(promise);
  try {
    return await promise;
  } finally {
    pendingCleanup.delete(promise);
  }
}
