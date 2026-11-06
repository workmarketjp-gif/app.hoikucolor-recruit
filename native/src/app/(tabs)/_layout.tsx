import { useAuth } from '@clerk/expo';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { CandidateTabIcon } from '../../components/CandidateTabIcon';
import type { TabGlyph } from '../../lib/candidateTabGlyphs';

const pink = '#E9265A';
const icon = (name: TabGlyph) => ({ color }: { color: string; focused: boolean }) =>
  <CandidateTabIcon name={name} color={color} />;

/** Matches src/components/CandidateShell.tsx mobile destinations, Web main fa779e73. */
export default function CandidateTabsLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF8FA' }}>
        <ActivityIndicator color={pink} />
      </View>
    );
  }
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs screenOptions={{
      headerShown: true,
      headerTitleStyle: { fontSize: 19, fontWeight: '800', color: '#30212B' },
      headerStyle: { backgroundColor: '#FFF8FA' },
      tabBarHideOnKeyboard: true,
      tabBarActiveTintColor: pink,
      tabBarInactiveTintColor: '#77717B',
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#F5DCE4', minHeight: 58 },
      tabBarLabelStyle: { fontSize: 12, fontWeight: '800', paddingTop: 2 },
    }}>
      <Tabs.Screen name="home" options={{ title: 'ホーム', headerTitle: 'Hoiku Color', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="jobs" options={{ title: '求人を探す', headerTitle: '求人を探す', tabBarIcon: icon('search') }} />
      <Tabs.Screen name="career" options={{ title: 'お給料', headerTitle: 'お給料・働き方', tabBarIcon: icon('yen') }} />
      <Tabs.Screen name="saved" options={{ title: '気になる', headerTitle: '気になる', tabBarIcon: icon('heart') }} />
      <Tabs.Screen name="profile" options={{ title: 'マイページ', headerTitle: 'マイページ', tabBarIcon: icon('user') }} />
      <Tabs.Screen name="applications" options={{ href: null, title: '応募管理', headerTitle: '応募管理' }} />
      <Tabs.Screen name="notifications" options={{ href: null, title: '通知', headerTitle: '通知' }} />
    </Tabs>
  );
}
