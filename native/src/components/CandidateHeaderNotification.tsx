import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNotifications } from '../contexts/NotificationContext';
import { usePrivateDataQuarantine } from '../hooks/usePrivateDataQuarantine';
import { candidateNotificationBadge } from '../lib/candidateNotificationBadge';

/** Native counterpart of Web CandidateShell's header notification action.
 * The badge is derived only from an owner/session-verifiable canonical count.
 * An unknown/error/locked count is NOT rendered as a confirmed zero.
 */
export function CandidateHeaderNotification() {
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const privacy = usePrivateDataQuarantine();
  const privateAllowed = !privacy.shieldVisible && privacy.canAccessPrivateData();
  const badge = candidateNotificationBadge(privateAllowed ? unreadCount : null);

  return <Pressable
    testID="candidate-header-notifications"
    accessibilityRole="button"
    accessibilityLabel={badge ? `通知を開く（未読${unreadCount}件）` : '通知を開く'}
    disabled={!privateAllowed}
    hitSlop={4}
    style={styles.button}
    onPress={() => {
      if (!privacy.shieldVisible && privacy.canAccessPrivateData()) {
        router.push('/(tabs)/notifications');
      }
    }}
  >
    {/* Web's outlined bell silhouette; RN primitives avoid emoji/font fallbacks. */}
    <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.dome} />
      <View style={styles.rim} />
      <View style={styles.clapper} />
    </View>
    {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minWidth: 48, minHeight: 48, paddingHorizontal: 7, marginRight: 8,
    alignItems: 'center', justifyContent: 'center' },
  icon: { width: 24, height: 24 },
  dome: { position: 'absolute', left: 6, top: 4, width: 12, height: 13,
    borderWidth: 1.8, borderColor: '#30212B', borderTopLeftRadius: 7,
    borderTopRightRadius: 7, borderBottomWidth: 0 },
  rim: { position: 'absolute', left: 4, top: 16, width: 16, height: 2,
    backgroundColor: '#30212B', borderRadius: 2 },
  clapper: { position: 'absolute', left: 10, top: 20, width: 4, height: 1.8,
    backgroundColor: '#30212B', borderRadius: 1 },
  badge: { position: 'absolute', right: 0, top: 1, minWidth: 18,
    height: 18, borderRadius: 9, paddingHorizontal: 3, backgroundColor: '#E9265A',
    borderWidth: 1.5, borderColor: '#FFF8FA', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900', lineHeight: 12 },
});
