import { useSession } from '@clerk/expo';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { listApplications } from '../lib/applicationJourneyApi';
import { candidateViewOwnerKey, readCandidateFreshlyVerifiedView, type CandidateOwnedView } from '../lib/candidateViewOwner';
import { readCandidateApplicationIndex } from '../lib/candidateApplicationIndexRead';
import { homeInProgressApplicationCount } from '../lib/homeApplicationProgressCount';
import { usePinnedCandidateAction } from './usePinnedCandidateAction';
import { usePrivateDataQuarantine } from './usePrivateDataQuarantine';

/**
 * Read the candidate's in-progress application count just as Web Home does.
 * Never borrow an old account's count, infer zero from a failed RPC or retry
 * a private read without a current explicit screen focus/user action.
 */
export function useHomeApplicationProgress() {
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const { pinCandidateAction } = usePinnedCandidateAction();
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const privateAllowed = !privacy.shieldVisible && privacy.canAccessPrivateData();
  const [ownedCount, setOwnedCount] = useState<CandidateOwnedView<number> | null>(null);
  const [ownedError, setOwnedError] = useState<CandidateOwnedView<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const freshlyVerifiedOwnerKey = useRef<string | null>(null);
  if (!privateAllowed) freshlyVerifiedOwnerKey.current = null;
  const count = readCandidateFreshlyVerifiedView(ownedCount, ownerKey, privateAllowed, freshlyVerifiedOwnerKey.current);
  const error = readCandidateFreshlyVerifiedView(ownedError, ownerKey, privateAllowed, freshlyVerifiedOwnerKey.current);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    freshlyVerifiedOwnerKey.current = null;
    setOwnedCount(null);
    setOwnedError(null);
    setLoading(true);
    if (!ownerKey || privacy.shieldVisible || !privacy.canAccessPrivateData()) {
      setLoading(false);
      return;
    }
    try {
      const verified = await readCandidateApplicationIndex({
        pin: pinCandidateAction,
        list: listApplications,
        expectedOwnerKey: ownerKey,
        resolveOwnerKey: candidateViewOwnerKey,
        isActive: () => request === generation.current &&
          !privacy.shieldVisible && privacy.canAccessPrivateData(),
      });
      if (request !== generation.current || privacy.shieldVisible || !privacy.canAccessPrivateData()) return;
      const nextCount = homeInProgressApplicationCount(verified.rows);
      freshlyVerifiedOwnerKey.current = verified.ownerKey;
      setOwnedCount({ ownerKey: verified.ownerKey, value: nextCount });
    } catch {
      if (request === generation.current && ownerKey &&
          !privacy.shieldVisible && privacy.canAccessPrivateData()) {
        freshlyVerifiedOwnerKey.current = ownerKey;
        setOwnedError({ ownerKey, value: '応募状況を確認できませんでした。再読み込みしてください。' });
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [ownerKey, pinCandidateAction, privacy.canAccessPrivateData, privacy.shieldVisible]);

  useFocusEffect(useCallback(() => {
    if (!ownerKey || !privateAllowed) {
      generation.current += 1;
      freshlyVerifiedOwnerKey.current = null;
      setOwnedCount(null);
      setOwnedError(null);
      setLoading(false);
      return;
    }
    void refresh();
    return () => {
      generation.current += 1;
      freshlyVerifiedOwnerKey.current = null;
    };
  }, [ownerKey, privateAllowed, refresh]));

  return { count, error, loading, refresh };
}
