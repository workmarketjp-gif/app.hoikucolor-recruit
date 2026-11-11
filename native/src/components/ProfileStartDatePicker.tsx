import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  isProfileCalendarDate,
  profileCalendarCells,
  profileCalendarInitialMonth,
  profileCalendarToday,
  shiftProfileCalendarMonth,
} from '../lib/profileDateCalendar';

type Props = {
  value: string | null;
  disabled: boolean;
  onChange: (value: string | null) => void;
};

const weekdays = ['月', '火', '水', '木', '金', '土', '日'];
const weekdayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

/**
 * Native, dependency-free equivalent of the Web jobseeker profile's optional
 * <input type="date">. This is NOT the visit booking calendar: dates are
 * intentionally unrestricted, and choosing a date only edits the local draft.
 */
export function ProfileStartDatePicker({ value, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => profileCalendarInitialMonth(value, profileCalendarToday()));

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) setMonth(profileCalendarInitialMonth(value, profileCalendarToday()));
  }, [value, open]);

  const valid = isProfileCalendarDate(value);
  const selectedLabel = valid
    ? `${Number(value.slice(0, 4))}年${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`
    : value ? `${value}（日付を選び直してください）` : '選択してください';

  const navigate = (offset: -12 | -1 | 1 | 12) => {
    const target = shiftProfileCalendarMonth(month, offset);
    if (target) setMonth(target);
  };

  const monthNumber = Number(month.slice(5, 7));
  const yearNumber = Number(month.slice(0, 4));
  const cells = profileCalendarCells(month);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>勤務開始希望日</Text>
      <Pressable testID="profile-start-date-select" accessibilityRole="button"
        accessibilityLabel={`勤務開始希望日 ${selectedLabel}`}
        accessibilityHint="日付をカレンダーから選択します"
        accessibilityState={{ disabled, expanded: open && !disabled }}
        disabled={disabled} style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={[styles.triggerValue, !value && styles.placeholder]}>{selectedLabel}</Text>
        <Text style={styles.triggerAction}>日付を選ぶ</Text>
      </Pressable>
      <Modal transparent animationType="slide" visible={open && !disabled}
        onRequestClose={() => setOpen(false)}>
        <View style={styles.layer}>
          <Pressable accessibilityRole="button" accessibilityLabel="日付選択を閉じる"
            style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.panel}>
            <Text style={styles.heading} accessibilityRole="header">勤務開始希望日</Text>
            <Text style={styles.hint}>希望する日付を選択してください。未選択にもできます。</Text>
            <View style={styles.monthControls}>
              {([
                [-12, '前年'], [-1, '前月'], [1, '次月'], [12, '翌年'],
              ] as const).map(([offset, label]) => {
                const canNavigate = shiftProfileCalendarMonth(month, offset) !== null;
                return (
                  <Pressable key={label} accessibilityRole="button" accessibilityLabel={label}
                    accessibilityState={{ disabled: !canNavigate }}
                    disabled={!canNavigate} style={[styles.monthButton, !canNavigate && styles.inactive]}
                    onPress={() => navigate(offset)}>
                    <Text style={styles.monthButtonText}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.monthHeading}>{yearNumber}年{monthNumber}月</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.calendarScroll}
              accessibilityLabel="勤務開始希望日カレンダー。画面が小さい場合は左右にスクロールできます">
              <View style={styles.grid}>
                {weekdays.map((weekday) => (
                  <View key={weekday} style={styles.cell}><Text style={styles.weekday}>{weekday}</Text></View>
                ))}
                {cells.map((day, index) => {
                  if (!day) return <View key={`blank-${index}`} style={styles.cell} />;
                  const selected = day === value;
                  const weekdayNumber = new Date(`${day}T00:00:00Z`).getUTCDay();
                  return (
                    <Pressable key={day} testID={`profile-day-${day}`} accessibilityRole="button"
                      accessibilityLabel={`${Number(day.slice(0, 4))}年${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日 ${weekdayNames[weekdayNumber]}`}
                      accessibilityState={{ selected }}
                      style={[styles.cell, styles.day, selected && styles.selectedDay]}
                      onPress={() => { onChange(day); setOpen(false); }}>
                      <Text style={[styles.dayText, selected && styles.selectedDayText]}>{Number(day.slice(8))}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <Pressable accessibilityRole="button" accessibilityLabel="勤務開始希望日を未選択にする"
              style={styles.clear} onPress={() => { onChange(null); setOpen(false); }}>
              <Text style={styles.clearText}>選択しない</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="日付選択を閉じる"
              style={styles.close} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '700', color: '#47505b' },
  trigger: { minHeight: 48, borderWidth: 1, borderColor: '#d7dce2', borderRadius: 11,
    paddingHorizontal: 13, backgroundColor: '#fff', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  triggerValue: { flex: 1, color: '#30212B', fontWeight: '600', fontSize: 16 },
  placeholder: { color: '#77717B' },
  triggerAction: { color: '#A9204B', fontWeight: '800', fontSize: 14 },
  layer: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0008' },
  panel: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    backgroundColor: '#fff', padding: 16, paddingBottom: 36, gap: 10 },
  heading: { color: '#30212B', fontWeight: '900', fontSize: 19 },
  hint: { color: '#716471', fontSize: 14, lineHeight: 20 },
  monthControls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4 },
  monthButton: { flex: 1, minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  monthButtonText: { color: '#A9204B', fontSize: 14, fontWeight: '800' },
  inactive: { opacity: 0.35 },
  monthHeading: { color: '#30212B', textAlign: 'center', fontSize: 16, fontWeight: '900' },
  calendarScroll: { paddingVertical: 4 },
  grid: { width: 322, flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: 46, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  weekday: { color: '#716471', fontWeight: '800', fontSize: 14 },
  day: { borderRadius: 10 },
  dayText: { color: '#30212B', fontWeight: '700', fontSize: 15 },
  selectedDay: { backgroundColor: '#E9265A' },
  selectedDayText: { color: '#fff', fontWeight: '900' },
  clear: { borderWidth: 1, borderColor: '#E8D5DE', borderRadius: 12, minHeight: 48,
    alignItems: 'center', justifyContent: 'center' },
  clearText: { color: '#A9204B', fontWeight: '800', fontSize: 16 },
  close: { minHeight: 48, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E9265A', borderRadius: 12 },
  closeText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
