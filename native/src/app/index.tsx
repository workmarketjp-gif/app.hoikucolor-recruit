import { Redirect, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { consumePostAuthCandidateRoute } from '../lib/authInitialLinkReturn';
import { useActiveClerkSession } from '../lib/sessionLifecycle';

/**
 * A signed-out cold link is redirected here by Stack.Protected. After Clerk
 * activates a real session, consume its one-shot candidate route *here* rather
 * than racing the sign-in screen's navigation with a protected-route guard.
 */
export default function EntryScreen() {
  const auth = useActiveClerkSession();
  const [destination, setDestination] = useState<{ sessionId: string; href: Href } | null>(null);

  useEffect(() => {
    if (!auth.active || !auth.sessionId) {
      setDestination(null);
      return;
    }
    const currentSession = auth.sessionId;
    let live = true;
    void consumePostAuthCandidateRoute(() => live)
      .then((target) => {
        if (live) {
          // The destination remains protected by Clerk, RLS and screen owner pins.
          setDestination({ sessionId: currentSession, href: (target ?? '/(tabs)/home') as Href });
        }
      })
      .catch(() => {
        if (live) setDestination({ sessionId: currentSession, href: '/(tabs)/home' });
      });
    return () => { live = false; };
  }, [auth.active, auth.sessionId]);

  if (!auth.isLoaded) return <WaitForSession />;
  if (!auth.isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (!auth.active || !auth.sessionId || destination?.sessionId !== auth.sessionId) {
    return <WaitForSession />;
  }
  return <Redirect href={destination.href} />;
}

function WaitForSession() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
