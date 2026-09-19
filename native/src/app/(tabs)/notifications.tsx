import { Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { useNotifications } from '../../contexts/NotificationContext';

export default function NotificationsScreen() {
  const notifications = useNotifications();

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.toolbar}>
        <Text style={styles.count}>{notifications.unreadCount ?? 0}件未読</Text>
        <View style={styles.toolbarActions}>
          <Pressable onPress={() => void notifications.refresh()}><Text style={styles.link}>更新</Text></Pressable>
          <Pressable onPress={() => void notifications.markAllRead()}><Text style={styles.link}>すべて既読</Text></Pressable>
        </View>
      </View>

      {notifications.loading && notifications.notifications.length === 0 ? <ActivityIndicator /> : null}
      {!notifications.loading && notifications.notifications.length === 0 ? (
        <Text style={styles.empty}>新しい通知はありません。</Text>
      ) : null}

      {notifications.notifications.map((notification) => (
        <Pressable
          key={notification.id}
          style={[styles.card, !notification.read_at && styles.unreadCard]}
          onPress={() => void notifications.openNotification(notification.id)}
        >
          <View style={styles.rowBetween}>
            <Text style={styles.title}>{notification.title}</Text>
            {!notification.read_at ? <Text style={styles.unreadMark}>未読</Text> : null}
          </View>
          <Text style={styles.body}>{notification.body}</Text>
          <Text style={styles.date}>{new Date(notification.created_at).toLocaleString('ja-JP')}</Text>
        </Pressable>
      ))}

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
  unreadCard: { borderWidth: 1, borderColor: '#b7c8ff' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 16, fontWeight: '800', flex: 1 },
  body: { color: '#4f5965', lineHeight: 20 },
  date: { color: '#7b8490', fontSize: 12 },
  unreadMark: { fontSize: 11, fontWeight: '800', backgroundColor: '#edf4ff', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  empty: { backgroundColor: '#fff', borderRadius: 14, padding: 20, color: '#606873' },
  permissionCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  button: { minHeight: 46, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  buttonText: { fontWeight: '800' },
});
