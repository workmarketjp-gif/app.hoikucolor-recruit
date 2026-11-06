import { View } from 'react-native';
import { candidateTabGlyphs, type TabGlyphPrimitive, type TabGlyph } from '../lib/candidateTabGlyphs';

/**
 * Cross-platform outlined icons matching the approved Web's five tab semantics.
 * No emoji, Unicode chess-pawn fallback, third-party icon/font or new native SDK.
 * The visible, accessible tab label is owned by Expo Router's Tabs.Screen.
 */
export function CandidateTabIcon({ name, color }: { name: TabGlyph; color: string }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ width: 24, height: 24 }}>
    {candidateTabGlyphs[name].map((shape: TabGlyphPrimitive, index) => {
      if (shape.kind === 'ring') {
        return <View key={index} style={{ position: 'absolute', left: shape.x, top: shape.y,
          width: shape.diameter, height: shape.diameter, borderWidth: 1.8,
          borderRadius: shape.diameter / 2, borderColor: color }} />;
      }
      if (shape.kind === 'shoulders') {
        return <View key={index} style={{ position: 'absolute', left: shape.x, top: shape.y,
          width: shape.width, height: shape.height, borderWidth: 1.8, borderBottomWidth: 0,
          borderTopLeftRadius: shape.width / 2, borderTopRightRadius: shape.width / 2,
          borderColor: color }} />;
      }
      const length = Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
      const rotation = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1) * 180 / Math.PI;
      return <View key={index} style={{ position: 'absolute',
        left: (shape.x1 + shape.x2 - length) / 2,
        top: (shape.y1 + shape.y2 - 1.8) / 2,
        width: length, height: 1.8, borderRadius: 1, backgroundColor: color,
        transform: [{ rotate: rotation.toString() + 'deg' }],
      }} />;
    })}
  </View>;
}
