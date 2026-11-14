import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { composeResumeBirthDate, splitResumeBirthDate } from '../lib/resumeBasicFieldPolicy';

/** Japanese Native date chooser. Only confirmed calendar-valid values reach the résumé RPC. */
export function ResumeBirthDateField({ value, onChange }: {
  value: string | null; onChange: (value: string | null) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  // Web /resume's <input type="date"> max is the current UTC ISO date.
  const todayUtc = new Date().toISOString().slice(0, 10);
  const selected = composeResumeBirthDate(year, month, day, todayUtc);
  const open = () => {
    const parts = splitResumeBirthDate(value);
    setYear(parts.year);
    setMonth(parts.month);
    setDay(parts.day);
    setVisible(true);
  };
  const close = () => setVisible(false);
  return <View style={styles.field}>
    <Text style={styles.label}>生年月日</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="生年月日を選択" onPress={open} style={styles.trigger}>
      <Text style={styles.triggerText}>{value ? value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日') : '生年月日を選択（未設定）'}</Text>
      <Text style={styles.chevron}>⌄</Text>
    </Pressable>
    {visible ? <Modal animationType="fade" transparent visible onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScroll}>
          <View style={styles.dialog}>
            <Text style={styles.title}>生年月日</Text>
            <Text style={styles.subtitle}>西暦の年・月・日を入力してください。未来の日付は選べません。</Text>
            <View style={styles.dateRow}>
              {([
                { label: '年', value: year, setter: setYear, length: 4, example: '1995' },
                { label: '月', value: month, setter: setMonth, length: 2, example: '05' },
                { label: '日', value: day, setter: setDay, length: 2, example: '09' },
              ] as const).map((part) => <View key={part.label} style={styles.datePart}>
                <Text style={styles.label}>{part.label}</Text>
                <TextInput style={styles.input} accessibilityLabel={'生年月日（' + part.label + '）'}
                  keyboardType="number-pad" maxLength={part.length} placeholder={part.example}
                  value={part.value} onChangeText={(text) => part.setter(text.replace(/[^0-9]/g, ''))} />
              </View>)}
            </View>
            {!selected && (year || month || day) ? <Text accessibilityRole="alert" style={styles.error}>実在する今日以前の日付を入力してください。</Text> : null}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" style={styles.action} onPress={() => { onChange(null); close(); }}>
                <Text style={styles.actionText}>未設定にする</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.action} onPress={close}>
                <Text style={styles.actionText}>キャンセル</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: !selected }}
                disabled={!selected} style={[styles.action, styles.confirm, !selected && styles.disabled]}
                onPress={() => { if (selected) onChange(selected); close(); }}>
                <Text style={styles.confirmText}>決定</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal> : null}
  </View>;
}

const styles = StyleSheet.create({
  field: { gap: 7 },
  label: { color: '#34232E', fontSize: 15, fontWeight: '800' },
  trigger: { minHeight: 48, borderWidth: 1, borderColor: '#D8C9D0', borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  triggerText: { fontSize: 16, color: '#281D25' },
  chevron: { color: '#B82051', fontSize: 20 },
  overlay: { flex: 1, justifyContent: 'center', backgroundColor: '#0008', paddingHorizontal: 16 },
  modalScroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  dialog: { backgroundColor: '#fff', padding: 18, borderRadius: 18, gap: 12 },
  title: { fontSize: 20, fontWeight: '900', color: '#30212B' },
  subtitle: { color: '#62575E', fontSize: 14, lineHeight: 21 },
  dateRow: { flexDirection: 'row', gap: 10 },
  datePart: { flex: 1, gap: 7 },
  input: { borderWidth: 1, borderColor: '#D8C9D0', borderRadius: 12, minHeight: 48, paddingHorizontal: 10, backgroundColor: '#fff', color: '#281D25', fontSize: 16, textAlign: 'center' },
  error: { fontSize: 14, lineHeight: 20, color: '#A12636' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 7 },
  action: { minHeight: 44, borderWidth: 1, borderColor: '#D8C9D0', borderRadius: 10, justifyContent: 'center', paddingHorizontal: 10 },
  actionText: { fontSize: 14, fontWeight: '700', color: '#453741' },
  confirm: { backgroundColor: '#E9265A', borderColor: '#E9265A' },
  confirmText: { fontSize: 14, fontWeight: '900', color: '#fff' },
  disabled: { opacity: 0.48 },
});
