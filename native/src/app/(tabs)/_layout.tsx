import { useAuth } from '@clerk/expo';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

export default function CandidateTabsLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs screenOptions={{ headerShown: true, tabBarHideOnKeyboard: true }}>
      <Tabs.Screen name="home" options={{ title: 'ホーム', headerTitle: 'Hoiku Color' }} />
      <Tabs.Screen name="jobs" options={{ title: '求人', headerTitle: '求人を探す' }} />
      <Tabs.Screen name="applications" options={{ title: '応募', headerTitle: '応募管理' }} />
      <Tabs.Screen name="saved" options={{ title: '保存', headerTitle: '保存した求人' }} />
      <Tabs.Screen name="notifications" options={{ title: '通知', headerTitle: '通知' }} />
      <Tabs.Screen name="profile" options={{ title: 'マイページ', headerTitle: 'プロフィール・書類' }} />
    </Tabs>
  );
}
