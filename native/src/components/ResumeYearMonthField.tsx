import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { composeResumeYearMonth } from '../lib/resumeEditor';

const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

/** A two-column Native equivalent of the Web /resume year+month selectors. */
export function ResumeYearMonthField({ label, value, onChange, disabled = false }: {
  label: string; value: string | null; onChange: (month: string | null) => void; disabled?: boolean;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear + 6 - 1950 + 1 }, (_, i) => String(currentYear + 6 - i));
  const [visible, setVisible] = useState(false);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const selected = composeResumeYearMonth(year, month, currentYear);
  const open = () => {
    setYear(value?.slice(0, 4) ?? '');
    setMonth(value?.slice(5, 7) ?? '');
    setVisible(true);
  };
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}を選ぶ`} accessibilityState={{ disabled }}
      disabled={disabled} onPress={open} style={[styles.trigger, disabled && styles.disabled]}>
      <Text style={styles.triggerText}>{value ? value.replace('-', '年') + '月' : '年月を選択（未設定）'}</Text>
      <Text style={styles.chevron}>⌄</Text>
    </Pressable>
    {visible ? <Modal animationType="fade" transparent visible={visible} onRequestClose={() => setVisible(false)}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.subtitle}>年と月をそれぞれ選択してください。</Text>
          <View style={styles.columns}>
            <View style={styles.column}>
              <Text style={styles.label}>年</Text>
              <ScrollView nestedScrollEnabled style={styles.scroll} contentContainerStyle={styles.items}>
                {years.map((y) => <Pressable key={y} accessibilityRole="button"
                  accessibilityState={{ selected: y === year }} onPress={() => setYear(y)}
                  style={[styles.option, y === year && styles.active]}>
                  <Text style={[styles.optionText, y === year && styles.activeText]}>{y}年</Text>
                </Pressable>)}
              </ScrollView>
            </View>
            <View style={styles.column}>
              <Text style={styles.label}>月</Text>
              <ScrollView nestedScrollEnabled style={styles.scroll} contentContainerStyle={styles.items}>
                {months.map((m) => <Pressable key={m} accessibilityRole="button"
                  accessibilityState={{ selected: m === month }} onPress={() => setMonth(m)}
                  style={[styles.option, m === month && styles.active]}>
                  <Text style={[styles.optionText, m === month && styles.activeText]}>{Number(m)}月</Text>
                </Pressable>)}
              </ScrollView>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => { onChange(null); setVisible(false); }} style={styles.action}>
              <Text style={styles.actionText}>未設定にする</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={styles.action}>
              <Text style={styles.actionText}>キャンセル</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !selected }}
              disabled={!selected} onPress={() => { if (selected) onChange(selected); setVisible(false); }}
              style={[styles.action, styles.confirm, !selected && styles.disabled]}>
              <Text style={styles.confirmText}>決定</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal> : null}
  </View>;
}

const styles = StyleSheet.create({
  field: { gap: 7 },
  label: { fontSize: 15, fontWeight: '800', color: '#34232E' },
  trigger: { minHeight: 48, borderWidth: 1, borderColor: '#D8C9D0', borderRadius: 12, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  triggerText: { fontSize: 16, color: '#281D25' },
  chevron: { fontSize: 20, color: '#B82051' },
  overlay: { flex: 1, justifyContent: 'center', backgroundColor: '#0008', paddingHorizontal: 20 },
  dialog: { backgroundColor: '#fff', borderRadius: 18, padding: 18, maxHeight: '85%', gap: 12 },
  title: { fontSize: 20, fontWeight: '900', color: '#30212B' },
  subtitle: { fontSize: 14, color: '#62575E' },
  columns: { flexDirection: 'row', gap: 12, height: 300 },
  column: { flex: 1, gap: 8 },
  scroll: { flex: 1 },
  items: { gap: 6, paddingBottom: 10 },
  option: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF9FB', borderRadius: 10, borderWidth: 1, borderColor: '#F4DAE4' },
  active: { backgroundColor: '#FFF0F4', borderColor: '#E9265A' },
  optionText: { fontSize: 15, color: '#453741', fontWeight: '700' },
  activeText: { color: '#B82051', fontWeight: '900' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 7 },
  action: { minHeight: 44, borderWidth: 1, borderColor: '#D8C9D0', borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  actionText: { fontSize: 14, fontWeight: '700', color: '#453741' },
  confirm: { backgroundColor: '#E9265A', borderColor: '#E9265A' },
  confirmText: { fontSize: 14, fontWeight: '900', color: '#fff' },
  disabled: { opacity: 0.48 },
});
