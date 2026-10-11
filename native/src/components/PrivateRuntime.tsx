import { useEffect, type PropsWithChildren } from 'react';
import { bootLog } from '../lib/bootDiagnostics';
import { AccountDeletionBoundary, AccountDeletionProvider } from '../contexts/AccountDeletionContext';
import { AppLockProvider } from '../contexts/AppLockContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import {
  ReleaseCompatibilityBoundary,
  ReleaseCompatibilityProvider,
} from '../contexts/ReleaseCompatibilityContext';
import { SessionFreshnessProvider } from '../contexts/SessionFreshnessContext';

export function PrivateRuntime({
  sessionId,
  children,
}: PropsWithChildren<{ sessionId: string }>) {
  useEffect(() => { bootLog('HC_PRIVATE_RUNTIME_MOUNTED'); }, []);
  return (
    <SessionFreshnessProvider key={sessionId}>
      <ReleaseCompatibilityProvider>
        <ReleaseCompatibilityBoundary>
          <AppLockProvider>
            <AccountDeletionProvider>
              <AccountDeletionBoundary>
                <NotificationProvider>
                  {children}
                </NotificationProvider>
              </AccountDeletionBoundary>
            </AccountDeletionProvider>
          </AppLockProvider>
        </ReleaseCompatibilityBoundary>
      </ReleaseCompatibilityProvider>
    </SessionFreshnessProvider>
  );
}
