/**
 * Flattens a PNG that has transparency onto a white background and returns an
 * opaque 8-bit RGB PNG (Web parity: the Web canvas fills white before drawing).
 *
 * Why this exists: JPEG has no alpha channel and the platform image encoders
 * composite transparent pixels onto black (or leave it undefined). Doing the
 * composite ourselves, on the exact bytes, makes the result checkable in tests.
 *
 * Supported input: non-interlaced PNG, bit depth 8 (the image module always emits
 * 8-bit RGBA) or 16 for colour types 0/2/4/6, palette depth 1-8, tRNS for types
 * 0/2/3. Anything else throws a user-readable error rather than guessing.
 */
import { unzlibSync, zlibSync } from 'fflate';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const UNSUPPORTED = '写真を白背景に整えられませんでした。JPEGの写真を選んでください。';

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function channelsFor(colorType: number): number {
  switch (colorType) {
    case 0: return 1;
    case 2: return 3;
    case 3: return 1;
    case 4: return 2;
    case 6: return 4;
    default: return 0;
  }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function unfilter(raw: Uint8Array, height: number, stride: number, bpp: number): Uint8Array {
  const out = new Uint8Array(height * stride);
  if (raw.length < height * (stride + 1)) throw new Error(UNSUPPORTED);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? out[dst + x - bpp] : 0;
      const up = y > 0 ? out[dst - stride + x] : 0;
      const upLeft = y > 0 && x >= bpp ? out[dst - stride + x - bpp] : 0;
      const value = raw[src + x];
      switch (filter) {
        case 0: out[dst + x] = value; break;
        case 1: out[dst + x] = (value + left) & 0xff; break;
        case 2: out[dst + x] = (value + up) & 0xff; break;
        case 3: out[dst + x] = (value + ((left + up) >> 1)) & 0xff; break;
        case 4: out[dst + x] = (value + paeth(left, up, upLeft)) & 0xff; break;
        default: throw new Error(UNSUPPORTED);
      }
    }
  }
  return out;
}

/** Composite one channel value over white: round(c*a/255 + 255*(255-a)/255). */
function overWhite(color: number, alpha: number): number {
  return Math.floor((color * alpha + 255 * (255 - alpha)) / 255 + 0.5);
}

export type FlattenedPng = { bytes: Uint8Array; width: number; height: number };

export function flattenPngOnWhite(png: Uint8Array): FlattenedPng {
  if (png.length < 33 || SIGNATURE.some((value, index) => png[index] !== value)) throw new Error(UNSUPPORTED);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let width = 0; let height = 0; let depth = 0; let colorType = -1; let interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  let offset = 8;
  let ended = false;
  while (offset + 12 <= png.length && !ended) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7]);
    const start = offset + 8;
    if (start + length + 4 > png.length) throw new Error(UNSUPPORTED);
    const data = png.subarray(start, start + length);
    if (crc32(png.subarray(offset + 4, start + length)) !== view.getUint32(start + length)) throw new Error(UNSUPPORTED);
    if (type === 'IHDR') {
      width = view.getUint32(start); height = view.getUint32(start + 4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') ended = true;
    offset = start + length + 4;
  }
  const channels = channelsFor(colorType);
  const samplesOk = colorType === 3 ? [1, 2, 4, 8].includes(depth) : (depth === 8 || depth === 16);
  if (!width || !height || !channels || !samplesOk || interlace !== 0 || !idat.length) throw new Error(UNSUPPORTED);
  if (width * height > 4_000_000) throw new Error(UNSUPPORTED); // flatten only the already-downscaled image
  if (colorType === 3 && !palette) throw new Error(UNSUPPORTED);

  const compressed = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of idat) { compressed.set(part, at); at += part.length; }
  let raw: Uint8Array;
  try { raw = unzlibSync(compressed); } catch { throw new Error(UNSUPPORTED); }

  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const pixels = unfilter(raw, height, stride, bpp);

  const sample = (row: number, index: number): number => {
    const base = row * stride;
    if (depth === 8) return pixels[base + index];
    if (depth === 16) return pixels[base + index * 2]; // high byte
    const perByte = 8 / depth;
    const byte = pixels[base + Math.floor(index / perByte)];
    const shift = 8 - depth * ((index % perByte) + 1);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  const maxSample = depth === 16 ? 255 : (1 << Math.min(depth, 8)) - 1;
  const trnsKey = (colorType === 0 || colorType === 2) && trns
    ? Array.from({ length: Math.min(channels, trns.length >> 1) }, (_, i) =>
      depth === 16 ? ((trns![i * 2] << 8) | trns![i * 2 + 1]) : ((trns![i * 2] << 8) | trns![i * 2 + 1]) & 0xff)
    : null;
  // For 16-bit tRNS keys compare the full sample; for others the key is the sample value.
  const fullSample = (row: number, index: number): number => {
    if (depth !== 16) return sample(row, index);
    const base = row * stride + index * 2;
    return (pixels[base] << 8) | pixels[base + 1];
  };

  const outStride = width * 3 + 1;
  const out = new Uint8Array(outStride * height);
  for (let y = 0; y < height; y += 1) {
    out[y * outStride] = 0;
    for (let x = 0; x < width; x += 1) {
      let r: number; let g: number; let b: number; let a = 255;
      if (colorType === 6) {
        r = sample(y, x * 4); g = sample(y, x * 4 + 1); b = sample(y, x * 4 + 2); a = sample(y, x * 4 + 3);
      } else if (colorType === 4) {
        r = g = b = sample(y, x * 2); a = sample(y, x * 2 + 1);
      } else if (colorType === 2) {
        r = sample(y, x * 3); g = sample(y, x * 3 + 1); b = sample(y, x * 3 + 2);
        if (trnsKey && trnsKey.length === 3 && fullSample(y, x * 3) === trnsKey[0]
          && fullSample(y, x * 3 + 1) === trnsKey[1] && fullSample(y, x * 3 + 2) === trnsKey[2]) a = 0;
      } else if (colorType === 0) {
        const v = sample(y, x);
        const scaled = depth < 8 ? Math.round((v * 255) / maxSample) : v;
        r = g = b = scaled;
        if (trnsKey && trnsKey.length === 1 && fullSample(y, x) === trnsKey[0]) a = 0;
      } else {
        const idx = sample(y, x);
        if (idx * 3 + 2 >= (palette as Uint8Array).length) throw new Error(UNSUPPORTED);
        r = (palette as Uint8Array)[idx * 3]; g = (palette as Uint8Array)[idx * 3 + 1]; b = (palette as Uint8Array)[idx * 3 + 2];
        a = trns && idx < trns.length ? trns[idx] : 255;
      }
      const o = y * outStride + 1 + x * 3;
      out[o] = overWhite(r, a); out[o + 1] = overWhite(g, a); out[o + 2] = overWhite(b, a);
    }
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width); ihdrView.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [new Uint8Array(SIGNATURE), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(out)), chunk('IEND', new Uint8Array(0))];
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let position = 0;
  for (const part of parts) { bytes.set(part, position); position += part.length; }
  return { bytes, width, height };
}
