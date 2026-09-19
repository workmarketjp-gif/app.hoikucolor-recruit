import type { AccountDeletionStatus } from './accountDeletionApi';

export type AccountDeletionUiPolicy = {
  blocksBusinessUi: boolean;
  quarantineCandidateDeviceState: boolean;
  canCancel: boolean;
  terminal: boolean;
};

export function getAccountDeletionUiPolicy(status: AccountDeletionStatus | null | undefined): AccountDeletionUiPolicy {
  if (!status || status === 'cancelled') {
    return { blocksBusinessUi: false, quarantineCandidateDeviceState: false, canCancel: false, terminal: false };
  }
  if (status === 'requested') {
    return { blocksBusinessUi: true, quarantineCandidateDeviceState: true, canCancel: true, terminal: false };
  }
  return {
    blocksBusinessUi: true,
    quarantineCandidateDeviceState: true,
    canCancel: false,
    terminal: status === 'completed',
  };
}
