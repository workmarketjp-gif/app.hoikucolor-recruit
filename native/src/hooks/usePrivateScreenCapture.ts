import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';
import { bootLog } from '../lib/bootDiagnostics';

// Candidate-private screens (profile, applications, messages, scouts, visits) must not
// appear in screenshots, screen recordings or the Android recents thumbnail. Public
// discovery screens deliberately stay capturable so people can share job listings.
export function usePrivateScreenCapture(screenKey: string) {
  useFocusEffect(
    useCallback(() => {
      const key = `hc-private-${screenKey}`;
      void preventScreenCaptureAsync(key).catch(() => bootLog('HC_SCREEN_PRIVACY_PREVENT_FAILED'));
      return () => {
        void allowScreenCaptureAsync(key).catch(() => undefined);
      };
    }, [screenKey]),
  );
}
