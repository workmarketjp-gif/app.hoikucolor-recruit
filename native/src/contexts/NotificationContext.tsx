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
  emptyAttentionSummary,
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

const NotificationContext = createContext<{
  notifications: JobseekerNotification[];
  unreadCount: number | null;
  loading: boolean;
  pushState: PushRegistrationState | null;
  attentionSummary: JobseekerAttentionSummary;
  reconciliationRevision: number;
  refresh: () => Promise<void>;
  enablePush: () => Promise<PushRegistrationState>;
  openPushSettings: () => Promise<void>;
  openNotification: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
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
  const privacy = usePrivateDataQuarantine();
  const { pinCandidateAction, pinCandidateSession } = usePinnedCandidateAction();
  const [notifications, setNotifications] = useState<JobseekerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushState, setPushState] = useState<PushRegistrationState | null>(null);
  const [attentionSummary, setAttentionSummary] = useState<JobseekerAttentionSummary>(emptyAttentionSummary);
  const [reconciliationRevision, setReconciliationRevision] = useState(0);
  const handledIds = useRef<Set<string>>(new Set());
  const processingIds = useRef<Set<string>>(new Set());
  const deferredResponses = useRef<Map<string, any>>(new Map());
  const pendingCanonicalReconciliation = useRef(false);
  const canonicalLoadGeneration = useRef(0);

  const loadCanonicalSnapshot = useCallback(async () => {
    const generation = ++canonicalLoadGeneration.current;
    const pinned = await pinCandidateAction();
    if (!pinned || generation !== canonicalLoadGeneration.current) {
      throw new Error('CANDIDATE_SESSION_CHANGED');
    }

    const [rowsResult, countResult, attentionResult] = await Promise.allSettled([
      listNotifications(pinned.client, 50),
      getUnreadNotificationCount(pinned.client),
      getJobseekerAttentionSummary(pinned.client),
    ]);

    if (!pinned.isCurrent() || generation !== canonicalLoadGeneration.current) {
      throw new Error('CANDIDATE_SESSION_CHANGED');
    }

    if (countResult.status === 'fulfilled') setUnreadCount(countResult.value);
    if (attentionResult.status === 'fulfilled') setAttentionSummary(attentionResult.value);
    setLoading(false);
    if (rowsResult.status === 'rejected') throw rowsResult.reason;
    setNotifications(rowsResult.value);
  }, [pinCandidateAction]);

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

    const pinned = await pinCandidateAction();
    if (!pinned) {
      deferredResponses.current.set(notificationId, response);
      return 'deferred' as const;
    }

    processingIds.current.add(notificationId);
    try {
      const route = await resolveNotificationRoute(pinned.client, notificationId);
      if (!pinned.isCurrent()) {
        deferredResponses.current.set(notificationId, response);
        return 'deferred' as const;
      }
      await markNotificationRead(pinned.client, notificationId).catch(() => undefined);
      if (!pinned.isCurrent()) {
        deferredResponses.current.set(notificationId, response);
        return 'deferred' as const;
      }
      handledIds.current.add(notificationId);
      deferredResponses.current.delete(notificationId);
      setReconciliationRevision((value) => value + 1);
      router.push(nativeNotificationHref(route, notificationId) as never);
      await refresh().catch(() => undefined);
      return 'handled' as const;
    } catch (error) {
      if (!pinned.isCurrent()) {
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
    const pinned = await pinCandidateAction();
    if (!pinned) return;
    const route = await resolveNotificationRoute(pinned.client, notificationId);
    if (!pinned.isCurrent()) return;
    await markNotificationRead(pinned.client, notificationId);
    if (!pinned.isCurrent()) return;
    await refresh().catch(() => undefined);
    if (!pinned.isCurrent()) return;
    router.push(nativeNotificationHref(route, notificationId) as never);
  }, [pinCandidateAction, refresh, router]);

  const markAllRead = useCallback(async () => {
    const pinned = await pinCandidateAction();
    if (!pinned) return;
    await markAllNotificationsRead(pinned.client);
    if (!pinned.isCurrent()) return;
    await refresh().catch(() => undefined);
  }, [pinCandidateAction, refresh]);

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
    if (unreadCount == null) return;
    void setCandidateNotificationBadgeCount(unreadCount).catch(() => undefined);
  }, [unreadCount]);

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    loading,
    pushState,
    attentionSummary,
    reconciliationRevision,
    refresh,
    enablePush: () => syncPush(true),
    openPushSettings: () => Linking.openSettings(),
    openNotification,
    markAllRead,
  }), [attentionSummary, loading, markAllRead, notifications, openNotification, pushState, reconciliationRevision, refresh, syncPush, unreadCount]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error('NotificationProvider is required');
  return value;
}
