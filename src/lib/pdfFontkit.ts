/**
 * Upstream fontkit v2 behind the interface pdf-lib expects. The @pdf-lib/fontkit fork
 * writes corrupt glyph data when subsetting large CJK TrueType fonts (characters vanish
 * from the PDF); fontkit v2 subsets correctly but returns bytes from `encode()` instead of
 * the old `encodeStream()` event stream, which this adapter recreates.
 */
import * as fontkit from 'fontkit';
import type { PDFDocument } from 'pdf-lib';

type Fontkit = Parameters<PDFDocument['registerFontkit']>[0];

type Listener = (value?: unknown) => void;

export const pdfFontkit = {
  create(data: Uint8Array) {
    const font = fontkit.create(data as never) as unknown as { createSubset: () => Record<string, unknown> };
    const createSubset = font.createSubset.bind(font);
    font.createSubset = () => {
      const subset = createSubset() as Record<string, unknown> & { encode: () => Uint8Array };
      subset.encodeStream = () => {
        const listeners: Record<string, Listener> = {};
        const stream = {
          on(event: string, listener: Listener) { listeners[event] = listener; return stream; },
        };
        queueMicrotask(() => {
          try {
            listeners.data?.(subset.encode());
            listeners.end?.();
          } catch (error) {
            listeners.error?.(error);
          }
        });
        return stream;
      };
      return subset;
    };
    return font;
  },
} as unknown as Fontkit;
