import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  isSelectableVisitCalendarDay,
  japanVisitToday,
  shiftVisitCalendarMonth,
  shiftVisitDay,
  visitCalendarCells,
} from '../lib/visitBookingForm';

type Props = {
  value: string;
  onChange: (day: string) => void;
  maxDaysAhead: number;
  availableWeekdays: readonly number[];
  disabled?: boolean;
};

const weekdays = ['月', '火', '水', '木', '金', '土', '日'];
const weekdayNames = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日'];

/** Dependency-free, keyboard-free date selection in the nursery's Japan time zone. */
export function VisitDateCalendar({ value, onChange, maxDaysAhead, availableWeekdays, disabled = false }: Props) {
  const now = Date.now();
  const today = japanVisitToday(now);
  const lastDay = shiftVisitDay(today, Number.isFinite(maxDaysAhead) ? Math.max(0, Math.trunc(maxDaysAhead)) : 0);
  const [month, setMonth] = useState((value || today).slice(0, 7));
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setMonth((value || japanVisitToday(Date.now())).slice(0, 7));
  }, [value]);

  const previous = shiftVisitCalendarMonth(month, -1);
  const next = shiftVisitCalendarMonth(month, 1);
  const canPrevious = !!previous && previous >= today.slice(0, 7);
  const canNext = !!next && next <= lastDay.slice(0, 7);
  const cells = visitCalendarCells(month);
  const valueLabel = value ? `${Number(value.slice(0, 4))}年${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日` : '日付を選択';

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`希望日 ${valueLabel}`}
        accessibilityHint={expanded ? 'カレンダーを閉じる' : '日付選択カレンダーを開く'}
        accessibilityState={{ expanded, disabled }}
        disabled={disabled}
        onPress={() => setExpanded((current) => !current)}
        style={[styles.trigger, disabled && styles.disabled]}
      >
        <Text style={styles.triggerText}>{valueLabel}</Text>
        <Text style={styles.triggerChevron}>{expanded ? '閉じる' : '日付を選ぶ'}</Text>
      </Pressable>
      {expanded && !disabled ? (
        <View style={styles.panel}>
          <View style={styles.monthNav}>
            <Pressable
              accessibilityRole="button" accessibilityLabel="前の月"
              accessibilityState={{ disabled: !canPrevious }}
              disabled={!canPrevious}
              style={[styles.monthButton, !canPrevious && styles.disabled]}
              onPress={() => { if (previous && canPrevious) setMonth(previous); }}
            ><Text style={styles.monthButtonText}>前月</Text></Pressable>
            <Text style={styles.monthTitle} accessibilityRole="header">{Number(month.slice(0, 4))}年{Number(month.slice(5, 7))}月</Text>
            <Pressable
              accessibilityRole="button" accessibilityLabel="次の月"
              accessibilityState={{ disabled: !canNext }}
              disabled={!canNext}
              style={[styles.monthButton, !canNext && styles.disabled]}
              onPress={() => { if (next && canNext) setMonth(next); }}
            ><Text style={styles.monthButtonText}>次月</Text></Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.calendarScroll}
            accessibilityLabel="日付カレンダー。小さい画面では左右にスクロールできます">
            <View style={styles.calendarGrid}>
              {weekdays.map((weekday) => <View key={weekday} style={styles.dayCell}><Text style={styles.weekday}>{weekday}</Text></View>)}
              {cells.map((day, index) => {
                if (!day) return <View key={`empty-${index}`} style={styles.dayCell} />;
                const enabled = isSelectableVisitCalendarDay(day, now, maxDaysAhead, availableWeekdays);
                const selected = day === value;
                const jsDay = new Date(`${day}T00:00:00Z`).getUTCDay();
                const weekday = weekdayNames[(jsDay + 6) % 7];
                return (
                  <Pressable key={day} accessibilityRole="button"
                    accessibilityLabel={`${Number(day.slice(0, 4))}年${Number(day.slice(5, 7))}月${Number(day.slice(8))}日 ${weekday}`}
                    accessibilityHint={enabled ? 'この日を希望日に指定する' : '施設の受付曜日または受付可能期間外です'}
                    accessibilityState={{ selected, disabled: !enabled }}
                    disabled={!enabled}
                    style={[styles.dayCell, styles.dayButton, selected && styles.selectedDay]}
                    onPress={() => { onChange(day); setExpanded(false); }}
                  ><Text style={[styles.dayText, !enabled && styles.unavailableDay, selected && styles.selectedDayText]}>{Number(day.slice(8))}</Text></Pressable>
                );
              })}
            </View>
          </ScrollView>
          <Text style={styles.help}>園の受付可能な曜日と期間のみ選べます。日時の最終確認は園の予約システムで行います。</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 8 },
  disabled: { opacity: 0.45 },
  trigger: { minHeight: 50, borderWidth: 1, borderColor: '#E8D5DE', borderRadius: 12,
    backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, gap: 8 },
  triggerText: { color: '#30212B', fontSize: 16, fontWeight: '800', flexShrink: 1 },
  triggerChevron: { color: '#B84E7B', fontSize: 14, fontWeight: '800' },
  panel: { backgroundColor: '#FFF8FB', borderWidth: 1, borderColor: '#F1D4E0', borderRadius: 14, padding: 8, gap: 8 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  monthButton: { minWidth: 64, minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  monthButtonText: { color: '#B84E7B', fontSize: 14, fontWeight: '800' },
  monthTitle: { color: '#30212B', fontSize: 16, fontWeight: '900' },
  calendarScroll: { paddingVertical: 2 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', width: 322 },
  dayCell: { width: 46, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  weekday: { color: '#716471', fontSize: 14, fontWeight: '800' },
  dayButton: { borderRadius: 10 },
  dayText: { color: '#30212B', fontSize: 15, fontWeight: '700' },
  unavailableDay: { color: '#A6A2A6' },
  selectedDay: { backgroundColor: '#E9265A' },
  selectedDayText: { color: '#fff', fontWeight: '900' },
  help: { color: '#716471', fontSize: 14, lineHeight: 20 },
});
