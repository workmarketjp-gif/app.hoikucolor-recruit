import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNotifications } from '../contexts/NotificationContext';
import { candidateNotificationHeaderDisclosure } from '../lib/candidateNotificationHeaderBadge';

/**
 * Header counterpart of Web CandidateShell's notification trigger.
 * Drawn with React Native primitives; no unreviewed icon/font dependency.
 * Expo Router owns the real notification list route and session guard.
 */
export function CandidateNotificationHeaderAction() {
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const disclosure = candidateNotificationHeaderDisclosure(unreadCount);

  return (
    <Pressable
      testID="candidate-header-notifications"
      accessibilityRole="button"
      accessibilityLabel={disclosure.accessibilityLabel}
      accessibilityHint="通知一覧を開きます"
      style={styles.trigger}
      onPress={() => router.push('/(tabs)/notifications')}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.bell}>
        <View style={styles.dome} />
        <View style={styles.leftFlare} />
        <View style={styles.rightFlare} />
        <View style={styles.rim} />
        <View style={styles.clapper} />
      </View>
      {disclosure.badgeText ? (
        <View pointerEvents="none" style={[styles.badge, disclosure.badgeText.length > 2 && styles.wideBadge]}>
          <Text style={styles.badgeText}>{disclosure.badgeText}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const ink = '#30212B';
const styles = StyleSheet.create({
  trigger: { width: 48, height: 48, marginRight: 10, justifyContent: 'center', alignItems: 'center' },
  bell: { width: 24, height: 24 },
  dome: { position: 'absolute', left: 6, top: 3, width: 12, height: 14,
    borderWidth: 1.8, borderBottomWidth: 0, borderColor: ink,
    borderTopLeftRadius: 7, borderTopRightRadius: 7 },
  leftFlare: { position: 'absolute', left: 3, top: 15.5, width: 5, height: 1.8,
    borderRadius: 1, backgroundColor: ink, transform: [{ rotate: '-12deg' }] },
  rightFlare: { position: 'absolute', left: 16, top: 15.5, width: 5, height: 1.8,
    borderRadius: 1, backgroundColor: ink, transform: [{ rotate: '12deg' }] },
  rim: { position: 'absolute', left: 3.5, top: 17.5, width: 17, height: 1.8,
    borderRadius: 1, backgroundColor: ink },
  clapper: { position: 'absolute', left: 9.5, top: 21, width: 5, height: 1.8,
    borderRadius: 1, backgroundColor: ink },
  badge: { position: 'absolute', top: 1, right: 0, minWidth: 18, height: 18,
    borderRadius: 9, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E9265A', borderWidth: 1, borderColor: '#FFF8FA' },
  wideBadge: { minWidth: 25 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800', textAlign: 'center',
    includeFontPadding: false },
});
