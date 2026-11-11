import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { readScoutClock, writeScoutClock } from '../lib/scoutTimeSelection';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute);
const CELL_HEIGHT = 48;

type Props = {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  enabled: boolean;
  defaultHour: number;
};

export function ScoutTimePicker({ label, value, onChange, enabled, defaultHour }: Props) {
  const [open, setOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const [hour, setHour] = useState(defaultHour);
  const [minute, setMinute] = useState(0);

  // Privacy shield, sign-out or account switch must also dismiss the modal.
  useEffect(() => { if (!enabled) setOpen(false); }, [enabled]);
  const dismiss = () => setOpen(false);
  const show = () => {
    if (!enabled) return;
    const parsed = readScoutClock(value);
    setHour(parsed?.hour ?? defaultHour);
    setMinute(parsed?.minute ?? 0);
    setPickerKey((previous) => previous + 1);
    setOpen(true);
  };
  const confirm = () => {
    if (!enabled) return;
    onChange(writeScoutClock(hour, minute));
    dismiss();
  };
  const clear = () => {
    if (!enabled) return;
    onChange(null);
    dismiss();
  };
  const time = writeScoutClock(hour, minute);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label + ' ' + (value ?? '未指定') + '。時刻を選択'}
        accessibilityState={{ disabled: !enabled }}
        disabled={!enabled}
        style={styles.field}
        onPress={show}
      >
        <Text style={value ? styles.fieldText : styles.placeholder}>{value ?? '時刻を選択'}</Text>
      </Pressable>
      <Modal visible={enabled && open} transparent animationType="slide" onRequestClose={dismiss}>
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            accessibilityRole="button"
            accessibilityLabel="時刻選択をキャンセル"
            onPress={dismiss}
          />
          <View style={styles.sheet}>
            <Text style={styles.heading}>{label}</Text>
            <Text style={styles.subheading}>24時間表記で時刻を選択</Text>
            <Text style={styles.preview} accessibilityLiveRegion="polite">{time}</Text>
            <View style={styles.columns}>
              <View style={styles.column}>
                <Text style={styles.columnLabel}>時</Text>
                <FlatList
                  key={'hours-' + pickerKey}
                  data={HOURS}
                  style={styles.options}
                  initialScrollIndex={hour}
                  getItemLayout={(_, index) => ({ length: CELL_HEIGHT, offset: CELL_HEIGHT * index, index })}
                  keyExtractor={(item) => String(item)}
                  showsVerticalScrollIndicator
                  renderItem={({ item }) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={item + '時'}
                      accessibilityState={{ selected: hour === item }}
                      style={[styles.option, hour === item && styles.selected]}
                      onPress={() => setHour(item)}
                    >
                      <Text style={[styles.optionText, hour === item && styles.selectedText]}>{String(item).padStart(2, '0')}</Text>
                    </Pressable>
                  )}
                />
              </View>
              <View style={styles.column}>
                <Text style={styles.columnLabel}>分</Text>
                <FlatList
                  key={'minutes-' + pickerKey}
                  data={MINUTES}
                  style={styles.options}
                  initialScrollIndex={minute}
                  getItemLayout={(_, index) => ({ length: CELL_HEIGHT, offset: CELL_HEIGHT * index, index })}
                  keyExtractor={(item) => String(item)}
                  showsVerticalScrollIndicator
                  renderItem={({ item }) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={item + '分'}
                      accessibilityState={{ selected: minute === item }}
                      style={[styles.option, minute === item && styles.selected]}
                      onPress={() => setMinute(item)}
                    >
                      <Text style={[styles.optionText, minute === item && styles.selectedText]}>{String(item).padStart(2, '0')}</Text>
                    </Pressable>
                  )}
                />
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={clear} style={styles.secondaryAction}>
                <Text style={styles.secondaryText}>指定しない</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={dismiss} style={styles.secondaryAction}>
                <Text style={styles.secondaryText}>キャンセル</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={confirm} style={styles.primaryAction}>
                <Text style={styles.primaryText}>決定</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 48, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, paddingHorizontal: 13, justifyContent: 'center', backgroundColor: '#fff' },
  fieldText: { fontSize: 16, color: '#252a31', fontWeight: '700' },
  placeholder: { fontSize: 16, color: '#737b86' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.38)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28, gap: 10, maxHeight: '85%' },
  heading: { fontSize: 20, color: '#252a31', fontWeight: '900' },
  subheading: { fontSize: 14, color: '#606873' },
  preview: { fontSize: 26, fontWeight: '900', textAlign: 'center', color: '#b4233e', marginBottom: 2 },
  columns: { flexDirection: 'row', gap: 12, height: 215 },
  column: { flex: 1, gap: 6 },
  columnLabel: { fontSize: 15, fontWeight: '800', textAlign: 'center', color: '#252a31' },
  options: { flex: 1, borderWidth: 1, borderColor: '#e6e8ec', borderRadius: 12 },
  option: { height: CELL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: '#fff0f3', borderWidth: 1, borderColor: '#e8445a', borderRadius: 10 },
  optionText: { fontSize: 16, fontWeight: '700', color: '#252a31' },
  selectedText: { fontWeight: '900', color: '#b4233e' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', paddingTop: 8 },
  secondaryAction: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#d7dce2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  secondaryText: { fontSize: 14, fontWeight: '800', color: '#252a31' },
  primaryAction: { minHeight: 48, borderRadius: 10, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryText: { fontSize: 15, fontWeight: '900', color: '#fff' },
});
