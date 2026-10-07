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
    <Tabs screenOptions={{ headerShown: true, tabBarHideOnKeyboard: true, tabBarLabelStyle: { fontSize: 12, fontWeight: '700' } }}>
      <Tabs.Screen name="home" options={{ title: 'ホーム', headerTitle: 'Hoiku Color' }} />
      <Tabs.Screen name="jobs" options={{ title: '求人', headerTitle: '求人を探す' }} />
      <Tabs.Screen name="saved" options={{ title: '気になる', headerTitle: '気になる' }} />
      <Tabs.Screen name="applications" options={{ title: '応募', headerTitle: '応募' }} />
      <Tabs.Screen name="profile" options={{ title: 'マイページ', headerTitle: 'マイページ' }} />
      <Tabs.Screen name="notifications" options={{ href: null, title: '通知', headerTitle: '通知' }} />
    </Tabs>
  );
}
