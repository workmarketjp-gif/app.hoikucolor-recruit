import { Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { useNotifications } from '../../contexts/NotificationContext';
import { usePrivateScreenCapture } from '../../hooks/usePrivateScreenCapture';
import { candidateNotificationCountPresentation, candidateNotificationEmptyPresentation } from '../../lib/notificationListPresentation';
import { notificationRelativeTime } from '../../lib/notificationRelativeTime';

export default function NotificationsScreen() {
  usePrivateScreenCapture('notifications');
  const notifications = useNotifications();
  const countPresentation = candidateNotificationCountPresentation({
    loaded: notifications.loaded,
    loading: notifications.loading,
    hasCanonicalError: Boolean(notifications.error),
    visibleCount: notifications.notifications.length,
    visibleUnreadCount: notifications.notifications.filter((notification) => !notification.read_at).length,
    unreadCount: notifications.unreadCount,
  });
  const emptyPresentation = candidateNotificationEmptyPresentation({
    loaded: notifications.loaded,
    loading: notifications.loading,
    hasCanonicalError: Boolean(notifications.error),
    visibleCount: notifications.notifications.length,
    unreadCount: notifications.unreadCount,
  });
  // Never mutate from an unavailable or contradictory canonical read.
  const canMarkAll = countPresentation.kind === 'unread' && !notifications.markAllReadPending;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.toolbar}>
        <Text style={styles.count}>{countPresentation.label}</Text>
        <View style={styles.toolbarActions}>
          <Pressable accessibilityRole="button" onPress={() => void notifications.refresh().catch(() => undefined)}><Text style={styles.link}>更新</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={!canMarkAll} accessibilityState={{ disabled: !canMarkAll }} onPress={() => void notifications.markAllRead().catch(() => undefined)}><Text style={styles.link}>すべて既読</Text></Pressable>
        </View>
      </View>

      {notifications.loading ? <ActivityIndicator color="#E9265A" /> : null}
      {notifications.error ? (
        <View style={styles.permissionCard} testID="notification-read-error">
          <Text style={styles.error}>{notifications.error}</Text>
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => void notifications.refresh().catch(() => undefined)}>
            <Text style={styles.buttonText}>もう一度読み込む</Text>
          </Pressable>
        </View>
      ) : null}
      {emptyPresentation === 'confirmed_empty' ? (
        <Text style={styles.empty}>新しい通知はありません。</Text>
      ) : null}
      {(emptyPresentation === 'inconsistent' || countPresentation.kind === 'inconsistent') ? (
        <View style={styles.permissionCard}>
          <Text style={styles.error} accessibilityRole="alert">未読件数と通知一覧が一致しません。更新して再確認してください。</Text>
        </View>
      ) : null}

      {notifications.loaded ? notifications.notifications.map((notification) => (
        <Pressable
          key={notification.id}
          accessibilityRole="button"
          disabled={notifications.openingNotificationId === notification.id}
          accessibilityState={{
            disabled: notifications.openingNotificationId === notification.id,
            busy: notifications.openingNotificationId === notification.id,
          }}
          style={[styles.card, !notification.read_at && styles.unreadCard]}
          onPress={() => void notifications.openNotification(notification.id)}
        >
          <View style={styles.rowBetween}>
            <Text style={styles.title}>{notification.title}</Text>
            {!notification.read_at ? <Text style={styles.unreadMark}>未読</Text> : null}
          </View>
          <Text style={styles.body}>{notification.body}</Text>
          <Text style={styles.date}>{notificationRelativeTime(notification.created_at)}</Text>
        </Pressable>
      )) : null}

      {notifications.pushState?.kind === 'permission_denied' ? (
        <View style={styles.permissionCard}>
          <Text style={styles.title}>通知がオフです</Text>
          <Text style={styles.body}>面接日程や園からの連絡を受け取るには端末設定で通知を許可してください。</Text>
          <Pressable style={styles.button} onPress={() => void notifications.openPushSettings()}>
            <Text style={styles.buttonText}>端末の通知設定を開く</Text>
          </Pressable>
        </View>
      ) : notifications.pushState?.kind !== 'registered' ? (
        <Pressable style={styles.button} onPress={() => void notifications.enablePush()}>
          <Text style={styles.buttonText}>プッシュ通知を有効にする</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10, backgroundColor: '#f7f8fa' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  toolbarActions: { flexDirection: 'row', gap: 14 },
  count: { fontWeight: '800' },
  link: { fontWeight: '800', textDecorationLine: 'underline' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 15, gap: 7 },
  unreadCard: { backgroundColor: '#fff8fa', borderWidth: 1, borderColor: '#ffd5df' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 16, fontWeight: '800', flex: 1 },
  body: { color: '#4f5965', lineHeight: 20 },
  date: { color: '#7b8490', fontSize: 12 },
  unreadMark: { fontSize: 11, fontWeight: '800', backgroundColor: '#fff1f4', color: '#a8244e', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  empty: { backgroundColor: '#fff', borderRadius: 14, padding: 20, color: '#606873' },
  error: { color: '#AC2643', fontSize: 14, lineHeight: 21, fontWeight: '700' },
  permissionCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  button: { minHeight: 46, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  buttonText: { fontWeight: '800' },
});
