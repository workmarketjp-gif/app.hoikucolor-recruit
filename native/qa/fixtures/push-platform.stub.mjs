// One stub standing in for expo-crypto, expo-device, expo-notifications, expo-secure-store,
// expo-constants, expo-application and react-native, for the push lifecycle suite only.
export const s = {
  os: 'android', permission: { status: 'granted', canAskAgain: true }, requestResult: null,
  token: 'ExponentPushToken[synthetic]', tokenFails: false, store: new Map(), projectId: 'project-1',
  calls: [], failUnregister: false, failPresentation: false, listener: null, gate: null,
};
const log = (name, ...args) => { s.calls.push([name, ...args]); };
export const Platform = { get OS() { return s.os; } };
export let isDevice = true;
export function setIsDevice(v) { isDevice = v; }
export const randomUUID = () => '99999999-9999-4999-8999-999999999999';
export async function getItemAsync(k) { return s.store.get(k) ?? null; }
export async function setItemAsync(k, v) { s.store.set(k, v); }
export const nativeApplicationVersion = '1.2.3';
export const nativeBuildVersion = '45';
export const IosAuthorizationStatus = { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 };
export const AndroidImportance = { DEFAULT: 3 };
export function setNotificationHandler() {}
export async function setNotificationChannelAsync(...a) { log('channel', ...a); }
export async function getPermissionsAsync() { return s.permission; }
export async function requestPermissionsAsync(opts) { log('requestPermission', opts); if (s.gate) await s.gate; return s.requestResult ?? s.permission; }
export async function getExpoPushTokenAsync(opts) {
  log('getToken', opts);
  if (s.gate) await s.gate;
  if (s.tokenFails) throw new Error('token unavailable');
  return { data: s.token };
}
export function addPushTokenListener(fn) { s.listener = fn; return { remove() { s.listener = null; } }; }
export async function unregisterForNotificationsAsync() { log('unregister'); if (s.failUnregister) throw new Error('no'); }
export async function dismissAllNotificationsAsync() { log('dismissAll'); if (s.failPresentation) throw new Error('no'); }
export async function setBadgeCountAsync(n) { log('badge', n); if (s.gate) await s.gate; return true; }
export async function clearLastNotificationResponseAsync() { log('clearResponse'); }
export default { get expoConfig() { return { extra: { eas: { projectId: s.projectId } } }; }, easConfig: null };
