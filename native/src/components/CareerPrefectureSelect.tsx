import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CareerPrefectureOption } from '../lib/careerPrefectureOptions';

/** Native counterpart of Web /career and dashboard prefecture <select>. */
export function CareerPrefectureSelect({
  selected, options, onChange, showCounts = false,
}: {
  selected: string;
  options: readonly CareerPrefectureOption[];
  onChange: (value: string) => void;
  showCounts?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = selected || '全国の求人';
  const close = () => setOpen(false);
  const choose = (value: string) => { close(); if (value !== selected) onChange(value); };
  const rows = [{ value: '', count: null }, ...options.filter(({ value }) => value !== '')];

  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel={'さがす地域：' + selectedLabel}
        accessibilityHint="地域の選択肢を開きます" accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)} style={styles.trigger}>
        <Text style={styles.triggerText}>{selectedLabel}</Text>
        <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">⌄</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button"
            accessibilityLabel="地域選択を閉じる" />
          <View style={styles.panel} accessibilityViewIsModal>
            <View style={styles.headingRow}>
              <Text style={styles.heading} accessibilityRole="header">さがす地域</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={close} style={styles.closeButton}>
                <Text style={styles.closeText}>閉じる</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
              {rows.map(({ value, count }) => {
                const label = value || '全国の求人';
                const fullLabel = value && showCounts && count !== null ? label + '（' + count + '件）' : label;
                const active = selected === value;
                return (
                  <Pressable key={value || '__all__'} accessibilityRole="button" accessibilityLabel={fullLabel}
                    accessibilityState={{ selected: active }} onPress={() => choose(value)}
                    style={[styles.option, active && styles.selected]}>
                    <Text style={[styles.optionText, active && styles.selectedText]}>{fullLabel}</Text>
                    {active ? <Text style={styles.check} accessibilityElementsHidden importantForAccessibility="no">✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: { borderWidth: 1, borderColor: '#E6CAD3', backgroundColor: '#fff', borderRadius: 12,
    minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  triggerText: { color: '#29222C', fontSize: 16, lineHeight: 24, fontWeight: '600', flexShrink: 1 },
  chevron: { color: '#C81B4D', fontSize: 22, fontWeight: '800' },
  overlay: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 28,
    backgroundColor: 'rgba(32,18,28,0.52)' },
  panel: { backgroundColor: '#fff', borderRadius: 20, padding: 16,
    width: '100%', maxHeight: '90%', gap: 12 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  heading: { color: '#30232D', fontSize: 19, fontWeight: '800', flexShrink: 1 },
  closeButton: { paddingHorizontal: 14, paddingVertical: 9, minHeight: 44, justifyContent: 'center' },
  closeText: { color: '#C81B4D', fontSize: 15, fontWeight: '700' },
  scroll: { flexShrink: 1 },
  list: { paddingBottom: 8, gap: 4 },
  option: { minHeight: 48, paddingHorizontal: 13, paddingVertical: 10,
    borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  selected: { backgroundColor: '#FFE4EC' },
  optionText: { fontSize: 16, lineHeight: 24, color: '#514751', flexShrink: 1 },
  selectedText: { fontWeight: '800', color: '#B41948' },
  check: { color: '#B41948', fontSize: 19, fontWeight: '800' },
});
