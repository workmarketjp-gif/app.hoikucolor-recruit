import * as Application from 'expo-application';
import { Platform } from 'react-native';

export type NativePlatform = 'ios' | 'android';

export type NativeReleaseIdentity = {
  platform: NativePlatform;
  appVersion: string;
  buildNumber: number;
  clientContractVersion: number;
};

function parsePositiveInteger(raw: string | null | undefined, label: string) {
  if (!raw || !/^\d+$/.test(raw)) throw new Error(`${label}_REQUIRED`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label}_INVALID`);
  return value;
}

export function getNativeReleaseIdentity(): NativeReleaseIdentity {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error('NATIVE_PLATFORM_REQUIRED');
  }

  const appVersion = Application.nativeApplicationVersion?.trim();
  if (!appVersion) throw new Error('NATIVE_APP_VERSION_REQUIRED');

  return {
    platform: Platform.OS,
    appVersion,
    buildNumber: parsePositiveInteger(Application.nativeBuildVersion, 'NATIVE_BUILD_NUMBER'),
    clientContractVersion: parsePositiveInteger(
      process.env.EXPO_PUBLIC_CLIENT_CONTRACT_VERSION,
      'CLIENT_CONTRACT_VERSION',
    ),
  };
}
