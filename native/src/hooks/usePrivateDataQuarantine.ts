import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useAppLock } from '../contexts/AppLockContext';
import { useSessionFreshness } from '../contexts/SessionFreshnessContext';

/**
 * Private candidate data must never be fetched or committed into screen state
 * while the app is backgrounded, the biometric/privacy shield is visible, or
 * the foreground Clerk session has not been freshly revalidated.
 *
 * Both boundaries are fail-closed. This hook also performs an imperative
 * AppState/ref check so a request that began while visible can discard a late
 * response if either privacy boundary closes before it resolves.
 */
export function usePrivateDataQuarantine() {
  const appLock = useAppLock();
  const sessionFreshness = useSessionFreshness();
  const shieldVisible = appLock.shieldVisible || sessionFreshness.shieldVisible;
  const shieldVisibleRef = useRef(true);
  shieldVisibleRef.current = shieldVisible;

  const canAccessPrivateData = useCallback(
    () => !shieldVisibleRef.current && AppState.currentState === 'active',
    [],
  );

  return {
    shieldVisible,
    shieldVisibleRef,
    canAccessPrivateData,
  };
}
