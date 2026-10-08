import type { PropsWithChildren } from 'react';
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
