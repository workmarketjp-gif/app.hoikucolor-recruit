import { useSession } from '@clerk/expo';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, Linking } from 'react-native';
import {
  getJobseekerAttentionSummary,
  type JobseekerAttentionSummary,
} from '../lib/attentionApi';
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  nativeNotificationHref,
  resolveNotificationRoute,
  syncPushRegistration,
  setCandidateNotificationBadgeCount,
  clearCandidateLastNotificationResponse,
  isPushBindingQuarantinedError,
  type JobseekerNotification,
  type PushRegistrationState,
} from '../lib/notifications';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import { usePrivateDataQuarantine } from '../hooks/usePrivateDataQuarantine';
import {
  candidateViewOwnerKey,
  readCandidateOwnedView,
  readCandidateFreshlyVerifiedView,
  type CandidateOwnedView,
} from '../lib/candidateViewOwner';
import { resolveCanonicalNotificationRead, type CanonicalNotificationRead } from '../lib/notificationReadSnapshot';
import { boundedPrivateRead } from '../lib/privateReadDeadline';
import { createNotificationMarkAllSingleFlight } from '../lib/notificationMarkAllSingleFlight';
import { createNotificationCardOpenGate } from '../lib/notificationCardOpenGate';
import { tryBeginNotificationResponse } from '../lib/notificationResponseFlight';
import { shouldDeferMessageNotificationRead } from '../lib/notificationMessageReadParity';

const NotificationContext = createContext<{
  notifications: JobseekerNotification[];
  unreadCount: number | null;
  loading: boolean;
  pushState: PushRegistrationState | null;
  attentionSummary: JobseekerAttentionSummary | null;
  loaded: boolean;
  error: string | null;
  reconciliationRevision: number;
  refresh: () => Promise<void>;
  enablePush: () => Promise<PushRegistrationState>;
  openPushSettings: () => Promise<void>;
  openNotification: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  markAllReadPending: boolean;
  openingNotificationId: string | null;
} | null>(null);

function responseNotificationId(response: any) {
  const raw = response?.notification?.request?.content?.data?.notificationId;
  return typeof raw === 'string' && raw ? raw : null;
}

function isDefinitiveNotificationMiss(error: unknown) {
  const text = String((error as { message?: unknown } | null)?.message ?? error ?? '');
  return /NOTIFICATION_NOT_FOUND|NOTIFICATION_ROUTE_NOT_FOUND/i.test(text);
}

export function NotificationProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const { pinCandidateAction, pinCandidateSession } = usePinnedCandidateAction();
  const [ownedSnapshot, setOwnedSnapshot] = useState<CandidateOwnedView<CanonicalNotificationRead<JobseekerNotification, JobseekerAttentionSummary>> | null>(null);
  const [ownedError, setOwnedError] = useState<CandidateOwnedView<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushState, setPushState] = useState<PushRegistrationState | null>(null);
  const [reconciliationRevision, setReconciliationRevision] = useState(0);
  const handledIds = useRef<Set<string>>(new Set());
  const processingIds = useRef<Set<string>>(new Set());
  const deferredResponses = useRef<Map<string, any>>(new Map());
  const pendingCanonicalReconciliation = useRef(false);
  const canonicalLoadGeneration = useRef(0);
  const markAllGate = useRef(createNotificationMarkAllSingleFlight());
  const cardOpenGate = useRef(createNotificationCardOpenGate());
  const [pendingOpenCard, setPendingOpenCard] = useState<{ ownerKey: string; notificationId: string } | null>(null);
  const [pendingMarkAllOwner, setPendingMarkAllOwner] = useState<string | null>(null);
  const verificationRef = useRef<string | null>(null);
  const ownerKey = candidateViewOwnerKey(session?.user?.id, session?.id);
  const privateAllowed = Boolean(ownerKey) && !privacy.shieldVisible && privacy.canAccessPrivateData();

  // Do not let an earlier same-session read become visible on lock/unlock.
  // This imperative revocation runs during render, before passive effects.
  if (!privateAllowed) verificationRef.current = null;
  const safeSnapshot = readCandidateFreshlyVerifiedView(
    ownedSnapshot, ownerKey, privateAllowed, verificationRef.current,
  );
  const safeError = readCandidateOwnedView(ownedError, ownerKey, privateAllowed);

  useEffect(() => {
    // A new owner or App Lock state invalidates in-flight responses. A fresh,
    // pinned canonical read is needed even if the user/session string is unchanged.
    canonicalLoadGeneration.current += 1;
    verificationRef.current = null;
    setOwnedSnapshot(null);
    setOwnedError(null);
    setLoading(true);
  }, [ownerKey, privacy.shieldVisible]);

  const loadCanonicalSnapshot = useCallback(async () => {
    const generation = ++canonicalLoadGeneration.current;
    verificationRef.current = null;
    setOwnedSnapshot(null);
    setOwnedError(null);
    setLoading(true);
    try {
      const pinned = await boundedPrivateRead(() => pinCandidateAction());
      const pinnedOwnerKey = candidateViewOwnerKey(pinned?.ownerId, pinned?.ownerSessionId);
      if (!pinned || !pinnedOwnerKey || pinnedOwnerKey !== ownerKey ||
          generation !== canonicalLoadGeneration.current || !pinned.isCurrent()) {
        throw new Error('CANDIDATE_SESSION_CHANGED');
      }

      const [rowsResult, countResult, attentionResult] = await Promise.allSettled([
        boundedPrivateRead(() => listNotifications(pinned.client, 50)),
        boundedPrivateRead(() => getUnreadNotificationCount(pinned.client)),
        boundedPrivateRead(() => getJobseekerAttentionSummary(pinned.client)),
      ]);

      if (!pinned.isCurrent() || generation !== canonicalLoadGeneration.current ||
          pinnedOwnerKey !== ownerKey) {
        throw new Error('CANDIDATE_SESSION_CHANGED');
      }

      // A failed list is an error, never a confirmed empty inbox. Failed count
      // or attention reads are unknown, never zero.
      const value = resolveCanonicalNotificationRead(rowsResult, countResult, attentionResult);
      verificationRef.current = pinnedOwnerKey;
      setOwnedSnapshot({ ownerKey: pinnedOwnerKey, value });
      setLoading(false);
    } catch (error) {
      // This also covers failed pinCandidateAction() and missing/expired auth.
      // A switched account, locked screen or obsolete generation receives no
      // error message or private state from its predecessor.
      if (generation === canonicalLoadGeneration.current && ownerKey &&
          !privacy.shieldVisible && privacy.canAccessPrivateData()) {
        verificationRef.current = null;
        setOwnedSnapshot(null);
        setOwnedError({
          ownerKey,
          value: '通知情報を取得できませんでした。通信環境を確認して更新してください。',
        });
        setLoading(false);
      }
      throw error;
    }
  }, [ownerKey, pinCandidateAction, privacy.canAccessPrivateData, privacy.shieldVisible]);

  const refresh = useCallback(async () => {
    if (privacy.shieldVisible) {
      pendingCanonicalReconciliation.current = true;
      return;
    }
    await loadCanonicalSnapshot();
    pendingCanonicalReconciliation.current = false;
  }, [privacy.shieldVisible, loadCanonicalSnapshot]);

  const reconcileCanonicalState = useCallback(async () => {
    if (privacy.shieldVisible) {
      pendingCanonicalReconciliation.current = true;
      return false;
    }
    try {
      await loadCanonicalSnapshot();
      pendingCanonicalReconciliation.current = false;
      setReconciliationRevision((value) => value + 1);
      return true;
    } catch {
      pendingCanonicalReconciliation.current = true;
      return false;
    }
  }, [privacy.shieldVisible, loadCanonicalSnapshot]);

  const syncPush = useCallback(async (requestPermission: boolean, devicePushToken?: any) => {
    const pinned = await pinCandidateSession();
    if (!pinned) throw new Error('PUSH_SESSION_UNAVAILABLE');
    const state = await syncPushRegistration({
      client: pinned.client,
      requestPermission,
      ...(devicePushToken ? { devicePushToken } : {}),
    });
    if (pinned.isCurrent()) setPushState(state);
    return state;
  }, [pinCandidateSession]);

  const handleResponse = useCallback(async (response: any) => {
    const notificationId = responseNotificationId(response);
    if (!notificationId) return 'ignored' as const;
    if (handledIds.current.has(notificationId) || processingIds.current.has(notificationId)) return 'ignored' as const;

    if (privacy.shieldVisible) {
      deferredResponses.current.set(notificationId, response);
      return 'deferred' as const;
    }

    // Cold-start replay and the live OS callback can arrive in the same
    // frame: claim synchronously before any asynchronous Clerk/session read.
    if (!tryBeginNotificationResponse(processingIds.current, notificationId)) return 'ignored' as const;
    let pinned: Awaited<ReturnType<typeof pinCandidateAction>> | null = null;
    try {
      // Reads are bounded, never the already-issued mark-read mutation.
      pinned = await boundedPrivateRead(() => pinCandidateAction());
      if (!pinned || !pinned.isCurrent() || privacy.shieldVisible) {
        deferredResponses.current.set(notificationId, response);
        return 'deferred' as const;
      }
      const active = pinned;
      const route = await boundedPrivateRead(() => resolveNotificationRoute(active.client, notificationId));
      const target = nativeNotificationHref(route, notificationId);
      if (!pinned.isCurrent()) {
        deferredResponses.current.set(notificationId, response);
        return 'deferred' as const;
      }
      // A missing/revoked or unconfirmed owned row cannot be acknowledged as read.
      // The existing catch routes safely to notifications and leaves retry pending.
      // Web leaves a message notification unread until its facility bubble is visible.
      // Only the server-verified message target may defer this canonical write.
      if (!shouldDeferMessageNotificationRead(route, target)) {
        await markNotificationRead(pinned.client, notificationId);
      }
      if (!pinned.isCurrent()) {
        deferredResponses.current.set(notificationId, response);
        return 'deferred' as const;
      }
      handledIds.current.add(notificationId);
      deferredResponses.current.delete(notificationId);
      setReconciliationRevision((value) => value + 1);
      router.push(target as never);
      await refresh().catch(() => undefined);
      return 'handled' as const;
    } catch (error) {
      if (!pinned || !pinned.isCurrent() || privacy.shieldVisible) {
        deferredResponses.current.set(notificationId, response);
        return 'deferred' as const;
      }
      if (isDefinitiveNotificationMiss(error)) {
        handledIds.current.add(notificationId);
        deferredResponses.current.delete(notificationId);
        router.push('/(tabs)/notifications');
        await refresh().catch(() => undefined);
        return 'handled' as const;
      }
      router.push('/(tabs)/notifications');
      return 'retry' as const;
    } finally {
      processingIds.current.delete(notificationId);
    }
  }, [privacy.shieldVisible, pinCandidateAction, refresh, router]);

  const openNotification = useCallback(async (notificationId: string) => {
    const pressedOwner = ownerKey;
    // Block same-frame repeated taps before React can render the disabled card.
    // The push-response path also uses processingIds; do not start a second
    // list-card write while an owned notification response is being handled.
    if (!pressedOwner || privacy.shieldVisible || !privacy.canAccessPrivateData() ||
        processingIds.current.has(notificationId) ||
        !cardOpenGate.current.tryStart(pressedOwner, notificationId)) return;
    processingIds.current.add(notificationId);
    setPendingOpenCard({ ownerKey: pressedOwner, notificationId });
    let pinned: Awaited<ReturnType<typeof pinCandidateAction>> | null = null;
    try {
      // Bound only pre-write private reads. An already-started mark-read RPC
      // must not be timed out and automatically retried with an unknown result.
      pinned = await boundedPrivateRead(() => pinCandidateAction());
      if (!pinned || !pinned.isCurrent() ||
          candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== pressedOwner) return;
      const route = await boundedPrivateRead(() => resolveNotificationRoute(pinned.client, notificationId));
      const target = nativeNotificationHref(route, notificationId);
      if (!pinned.isCurrent()) return;
      if (!shouldDeferMessageNotificationRead(route, target)) {
        await markNotificationRead(pinned.client, notificationId);
      }
      if (!pinned.isCurrent()) return;
      // A readback failure is not a confirmed empty list or zero badge.
      await refresh().catch(() => undefined);
      if (!pinned.isCurrent()) return;
      router.push(target as never);
    } catch {
      if (pinned && (!pinned.isCurrent() ||
          candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== pressedOwner)) return;
      setOwnedError({ ownerKey: pressedOwner, value: '通知を開けませんでした。もう一度お試しください。' });
    } finally {
      processingIds.current.delete(notificationId);
      cardOpenGate.current.complete(pressedOwner, notificationId);
      setPendingOpenCard((current) =>
        current?.ownerKey === pressedOwner && current.notificationId === notificationId ? null : current);
    }
  }, [ownerKey, pinCandidateAction, privacy.canAccessPrivateData, privacy.shieldVisible, refresh, router]);

  const markAllRead = useCallback(async () => {
    const ownerAtPress = ownerKey;
    if (!ownerAtPress || privacy.shieldVisible || !privacy.canAccessPrivateData() ||
        !markAllGate.current.tryStart(ownerAtPress)) return;
    const pressGeneration = canonicalLoadGeneration.current;
    setPendingMarkAllOwner(ownerAtPress);
    try {
      // Pin before any write. A stalled credential read must not hold an
      // invisible in-flight action forever; a started RPC is never timed out.
      const pinned = await boundedPrivateRead(() => pinCandidateAction());
      if (!pinned || candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== ownerAtPress ||
          !pinned.isCurrent() || pressGeneration !== canonicalLoadGeneration.current) return;
      try {
        // A malformed integer result is an unknown write outcome. Refresh is
        // deliberately NOT used to infer success inside the adapter.
        await markAllNotificationsRead(pinned.client);
        if (!pinned.isCurrent()) return;
        await refresh();
      } catch {
        if (!pinned.isCurrent()) return;
        setOwnedError({ ownerKey: ownerAtPress, value: '通知を既読にできませんでした。更新して再確認してください。' });
      }
    } catch {
      // Pre-write credential failure: no mutation was launched.
      setOwnedError({ ownerKey: ownerAtPress, value: '通知を既読にできませんでした。もう一度お試しください。' });
    } finally {
      markAllGate.current.complete(ownerAtPress);
      setPendingMarkAllOwner((current) => current === ownerAtPress ? null : current);
    }
  }, [ownerKey, pinCandidateAction, privacy.canAccessPrivateData, privacy.shieldVisible, refresh]);

  const consumeLastResponse = useCallback(async () => {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return;
    const result = await handleResponse(response);
    if (result === 'handled') await clearCandidateLastNotificationResponse().catch(() => undefined);
  }, [handleResponse]);

  useEffect(() => {
    if (privacy.shieldVisible || deferredResponses.current.size === 0) return;
    let cancelled = false;
    void (async () => {
      for (const response of [...deferredResponses.current.values()]) {
        if (cancelled || privacy.shieldVisible) return;
        const result = await handleResponse(response);
        if (result === 'handled') await clearCandidateLastNotificationResponse().catch(() => undefined);
        if (result === 'retry' || result === 'deferred') return;
      }
    })();
    return () => { cancelled = true; };
  }, [privacy.shieldVisible, handleResponse]);

  useEffect(() => {
    void reconcileCanonicalState().then((ok) => {
      if (!ok && !privacy.shieldVisible) setLoading(false);
    });
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      void reconcileCanonicalState();
    }, 60_000);
    return () => clearInterval(timer);
  }, [privacy.shieldVisible, reconcileCanonicalState]);

  useEffect(() => {
    void syncPush(false).catch((error) => {
      if (isPushBindingQuarantinedError(error)) return;
      setPushState({ kind: 'error', authorized: false, message: String((error as { message?: unknown } | null)?.message ?? error) });
    });

    const tokenSubscription = Notifications.addPushTokenListener((devicePushToken: any) => {
      void syncPush(false, devicePushToken).catch((error) => {
        if (!isPushBindingQuarantinedError(error)) {
          setPushState({ kind: 'error', authorized: false, message: String((error as { message?: unknown } | null)?.message ?? error) });
        }
      });
    });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void reconcileCanonicalState();
      void syncPush(false).catch(() => undefined);
      if (!privacy.shieldVisible) void consumeLastResponse().catch(() => undefined);
    });

    return () => {
      tokenSubscription.remove();
      appStateSubscription.remove();
    };
  }, [privacy.shieldVisible, consumeLastResponse, reconcileCanonicalState, syncPush]);

  useEffect(() => {
    void consumeLastResponse().catch(() => undefined);
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleResponse(response).then((result) => {
        if (result === 'handled') void clearCandidateLastNotificationResponse().catch(() => undefined);
      });
    });
    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      void reconcileCanonicalState();
    });
    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    };
  }, [consumeLastResponse, handleResponse, reconcileCanonicalState]);

  useEffect(() => {
    // Never replace an OS badge with an inferred zero or a previous owner's count.
    if (safeSnapshot?.unreadCount == null) return;
    void setCandidateNotificationBadgeCount(safeSnapshot.unreadCount).catch(() => undefined);
  }, [safeSnapshot?.unreadCount]);

  const value = useMemo(() => ({
    notifications: safeSnapshot?.notifications ?? [],
    unreadCount: safeSnapshot?.unreadCount ?? null,
    loading: privateAllowed && loading && safeSnapshot === null && safeError === null,
    loaded: safeSnapshot !== null,
    error: safeError ?? safeSnapshot?.warning ?? null,
    pushState: privateAllowed ? pushState : null,
    attentionSummary: safeSnapshot?.attentionSummary ?? null,
    reconciliationRevision,
    refresh,
    enablePush: () => syncPush(true),
    openPushSettings: () => Linking.openSettings(),
    openNotification,
    markAllRead,
    markAllReadPending: privateAllowed && pendingMarkAllOwner === ownerKey,
    openingNotificationId: privateAllowed && pendingOpenCard?.ownerKey === ownerKey
      ? pendingOpenCard.notificationId : null,
  }), [loading, markAllRead, openNotification, ownerKey, pendingMarkAllOwner, pendingOpenCard, privateAllowed, pushState,
    reconciliationRevision, refresh, safeError, safeSnapshot, syncPush]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error('NotificationProvider is required');
  return value;
}
