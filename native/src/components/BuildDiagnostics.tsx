import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

export function BuildDiagnostics() {
  const [visible, setVisible] = useState(false);
  const provenance = Constants.expoConfig?.extra?.buildProvenance;
  if (!__DEV__ && provenance?.profile !== 'preview' && provenance?.profile !== 'development') return null;
  return <View>
    <Pressable accessibilityRole="button" onPress={() => setVisible(!visible)} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text>QA: ビルド情報{visible ? 'を閉じる' : 'を表示'}</Text>
    </Pressable>
    {visible ? <Text selectable style={{ fontSize: 12 }}>
      {JSON.stringify({ appVersion: Application.nativeApplicationVersion, versionCode: Application.nativeBuildVersion,
        clientContractVersion: process.env.EXPO_PUBLIC_CLIENT_CONTRACT_VERSION ?? 'unset',
        ...provenance, runtimeVersion: Constants.expoConfig?.runtimeVersion,
        updateIdentity: 'expo-updates not installed (embedded bundle)', projectId: Constants.easConfig?.projectId }, null, 2)}
    </Text> : null}
  </View>;
}
