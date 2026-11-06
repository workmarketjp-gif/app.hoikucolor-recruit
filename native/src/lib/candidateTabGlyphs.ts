/**
 * 24x24, dependency-free line geometry for the five approved Hoiku Color Web
 * mobile tabs. Coordinates follow src/components/Icon.tsx (Web main fa779e73).
 * RN View primitives render these without system-dependent Unicode glyphs.
 */
export type TabGlyph = 'home' | 'search' | 'yen' | 'heart' | 'user';
export type TabGlyphPrimitive =
  | { kind: 'stroke'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'ring'; x: number; y: number; diameter: number }
  | { kind: 'shoulders'; x: number; y: number; width: number; height: number };

const stroke = (x1: number, y1: number, x2: number, y2: number): TabGlyphPrimitive =>
  ({ kind: 'stroke', x1, y1, x2, y2 });

const home = [
  stroke(3, 11.5, 12, 4), stroke(12, 4, 21, 11.5),
  stroke(5.5, 10.5, 5.5, 20), stroke(18.5, 10.5, 18.5, 20),
  stroke(5.5, 20, 18.5, 20),
  stroke(9.5, 20, 9.5, 14), stroke(9.5, 14, 14.5, 14), stroke(14.5, 14, 14.5, 20),
];
const search = [
  { kind: 'ring' as const, x: 4.5, y: 4.5, diameter: 13 },
  stroke(16, 16, 20.5, 20.5),
];
const yen = [
  stroke(6, 4, 12, 12), stroke(18, 4, 12, 12),
  stroke(12, 12, 12, 20), stroke(7.5, 13.5, 16.5, 13.5),
  stroke(7.5, 17, 16.5, 17),
];
// The Web heart is a rounded outline rather than a filled symbol. Closely
// sampled segments avoid platform-specific glyph/emoji fallback on Android/iOS.
const heart = [
  [12, 7.7, 10.7, 5.6], [10.7, 5.6, 9, 4.7], [9, 4.7, 7.1, 4.6],
  [7.1, 4.6, 5.1, 5.5], [5.1, 5.5, 3.8, 7.2], [3.8, 7.2, 3.5, 9.2],
  [3.5, 9.2, 4.2, 11.8], [4.2, 11.8, 6.2, 14.4],
  [6.2, 14.4, 9.3, 17.1], [9.3, 17.1, 12, 19],
  [12, 19, 14.7, 17.1], [14.7, 17.1, 17.8, 14.4],
  [17.8, 14.4, 19.8, 11.8], [19.8, 11.8, 20.5, 9.2],
  [20.5, 9.2, 20.2, 7.2], [20.2, 7.2, 18.9, 5.5],
  [18.9, 5.5, 16.9, 4.6], [16.9, 4.6, 15, 4.7],
  [15, 4.7, 13.3, 5.6], [13.3, 5.6, 12, 7.7],
].map((v) => stroke(v[0], v[1], v[2], v[3]));
const user = [
  { kind: 'ring' as const, x: 8, y: 4, diameter: 8 },
  { kind: 'shoulders' as const, x: 4.5, y: 13.5, width: 15, height: 7.5 },
];

export const candidateTabGlyphs: Readonly<Record<TabGlyph, readonly TabGlyphPrimitive[]>> = {
  home, search, yen, heart, user,
};
