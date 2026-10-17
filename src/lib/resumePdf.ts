/**
 * A4 PDF generation for 履歴書 / 職務経歴書, loaded on demand (dynamic import) so pdf-lib
 * and the Japanese font never touch the initial bundle.
 *
 * Why client-side PDF rather than print CSS: the PDF must become a File that is saved
 * to the private document vault and attached to applications, and mobile browsers'
 * print-to-PDF is inconsistent (iOS adds headers / can't return the file to the page).
 *
 * Font: BIZ UDGothic (SIL OFL 1.1), served from /fonts as a cp932 subset (~2 MB, cached
 * immutable). pdf-lib subsets it again per document, so a typical PDF stays ~100 KB.
 * Characters outside the subset are shown as 〓 and reported back to the candidate.
 */
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { pdfFontkit } from './pdfFontkit';
import type { HistoryRow, ResumeModel, WorkHistoryModel } from './resumeDocument';

export const RESUME_FONT_URL = '/fonts/biz-udgothic-jp-subset-v1.ttf';

const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN_X = 15 * MM;
const MARGIN_TOP = 14 * MM;
const MARGIN_BOTTOM = 16 * MM;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const INK = rgb(0.1, 0.12, 0.16);
const SOFT = rgb(0.38, 0.4, 0.45);
const LINE = rgb(0.25, 0.25, 0.28);
const SHADE = rgb(0.94, 0.94, 0.95);

// Kinsoku: characters that must not start a line hang at the end of the previous one.
const NO_LINE_START = new Set(Array.from('、。，．,.・：；:;？！?!ー〜～）)」』】〕］]｝}〉》’”ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ%％'));
const WORD_CHAR = /[A-Za-z0-9@._\-+/]/;

let fontBytesPromise: Promise<ArrayBuffer> | null = null;
function loadFontBytes() {
  if (!fontBytesPromise) {
    fontBytesPromise = fetch(RESUME_FONT_URL).then((response) => {
      if (!response.ok) throw new Error('日本語フォントを読み込めませんでした。通信状況を確認してください。');
      return response.arrayBuffer();
    });
    fontBytesPromise.catch(() => { fontBytesPromise = null; });
  }
  return fontBytesPromise;
}

export type PdfResult = { bytes: Uint8Array; missingCharacters: string[] };
export type ResumePhoto = { bytes: ArrayBuffer; type: 'image/jpeg' | 'image/png' };

class Writer {
  page!: PDFPage;
  y = 0;
  private widths = new Map<string, number>();
  private supported: Set<number>;
  readonly missing = new Set<string>();
  readonly doc: PDFDocument;
  readonly font: PDFFont;

  constructor(doc: PDFDocument, font: PDFFont) {
    this.doc = doc;
    this.font = font;
    this.supported = new Set(font.getCharacterSet());
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN_TOP;
    return this.page;
  }

  /** True when `height` still fits on the current page; otherwise starts a new page. */
  ensure(height: number) {
    if (this.y - height >= MARGIN_BOTTOM) return false;
    this.newPage();
    return true;
  }

  safe(value: string) {
    let out = '';
    for (const ch of Array.from(value.normalize('NFC').replace(/\t/g, ' ').replace(/\r/g, ''))) {
      if (ch === '\n' || this.supported.has(ch.codePointAt(0)!)) out += ch;
      else { this.missing.add(ch); out += '〓'; }
    }
    return out;
  }

  width(value: string, size: number) {
    let total = 0;
    for (const ch of Array.from(value)) {
      const key = `${size}|${ch}`;
      let w = this.widths.get(key);
      if (w === undefined) { w = this.font.widthOfTextAtSize(ch, size); this.widths.set(key, w); }
      total += w;
    }
    return total;
  }

  wrap(value: string, maxWidth: number, size: number): string[] {
    const lines: string[] = [];
    for (const paragraph of this.safe(value).split('\n')) {
      const chars = Array.from(paragraph);
      if (!chars.length) { lines.push(''); continue; }
      let line: string[] = [];
      let lineWidth = 0;
      for (const ch of chars) {
        const w = this.width(ch, size);
        if (lineWidth + w > maxWidth && line.length) {
          if (NO_LINE_START.has(ch)) { line.push(ch); lineWidth += w; continue; }
          let carry: string[] = [];
          if (WORD_CHAR.test(ch) && WORD_CHAR.test(line[line.length - 1])) {
            let start = line.length;
            while (start > 0 && WORD_CHAR.test(line[start - 1])) start -= 1;
            if (start > 0) { carry = line.slice(start); line = line.slice(0, start); }
          }
          lines.push(line.join('').trimEnd());
          line = carry;
          lineWidth = this.width(carry.join(''), size);
        }
        line.push(ch);
        lineWidth += w;
      }
      lines.push(line.join('').trimEnd());
    }
    return lines;
  }

  text(value: string, x: number, y: number, size: number, color = INK) {
    if (!value) return;
    this.page.drawText(this.safe(value), { x, y, size, font: this.font, color });
  }

  textRight(value: string, right: number, y: number, size: number, color = INK) {
    const safe = this.safe(value);
    this.page.drawText(safe, { x: right - this.width(safe, size), y, size, font: this.font, color });
  }

  textCenter(value: string, left: number, width: number, y: number, size: number, color = INK) {
    const safe = this.safe(value);
    this.page.drawText(safe, { x: left + (width - this.width(safe, size)) / 2, y, size, font: this.font, color });
  }

  rect(x: number, yTop: number, w: number, h: number, options: { fill?: boolean; thickness?: number } = {}) {
    this.page.drawRectangle({
      x, y: yTop - h, width: w, height: h,
      borderColor: LINE, borderWidth: options.thickness ?? 0.6,
      color: options.fill ? SHADE : undefined,
    });
  }

  vline(x: number, yTop: number, h: number) {
    this.page.drawLine({ start: { x, y: yTop }, end: { x, y: yTop - h }, thickness: 0.4, color: LINE });
  }

  hline(x: number, y: number, w: number, thickness = 0.4) {
    this.page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness, color: LINE });
  }
}

async function createWriter(title: string) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(pdfFontkit);
  const font = await doc.embedFont(await loadFontBytes(), { subset: true });
  doc.setTitle(title);
  doc.setCreator('Hoiku Color');
  doc.setProducer('Hoiku Color');
  doc.setCreationDate(new Date());
  doc.setModificationDate(new Date());
  const writer = new Writer(doc, font);
  writer.newPage();
  return writer;
}

function addPageNumbers(writer: Writer) {
  const pages = writer.doc.getPages();
  if (pages.length < 2) return;
  pages.forEach((page, index) => {
    writer.page = page;
    writer.textCenter(`${index + 1} / ${pages.length}`, 0, PAGE_W, MARGIN_BOTTOM / 2, 8, SOFT);
  });
}

async function finish(writer: Writer): Promise<PdfResult> {
  addPageNumbers(writer);
  return { bytes: await writer.doc.save(), missingCharacters: [...writer.missing] };
}

/* --------------------------------- 履歴書 --------------------------------- */

const YEAR_W = 16 * MM;
const MONTH_W = 10 * MM;
const ROW_H = 7.6 * MM;
const BODY_SIZE = 9.5;

function drawHistoryHeader(w: Writer, title: string) {
  const x = MARGIN_X;
  w.rect(x, w.y, CONTENT_W, ROW_H, { fill: true });
  w.vline(x + YEAR_W, w.y, ROW_H);
  w.vline(x + YEAR_W + MONTH_W, w.y, ROW_H);
  const baseline = w.y - ROW_H / 2 - 3;
  w.textCenter('年', x, YEAR_W, baseline, 8.5);
  w.textCenter('月', x + YEAR_W, MONTH_W, baseline, 8.5);
  w.textCenter(title, x + YEAR_W + MONTH_W, CONTENT_W - YEAR_W - MONTH_W, baseline, 8.5);
  w.y -= ROW_H;
}

function drawHistoryTable(w: Writer, title: string, rows: HistoryRow[], minRows: number) {
  const x = MARGIN_X;
  const textX = x + YEAR_W + MONTH_W + 3 * MM;
  const textW = CONTENT_W - YEAR_W - MONTH_W - 6 * MM;
  w.ensure(ROW_H * 3);
  drawHistoryHeader(w, title);
  const padded = [...rows];
  while (padded.length < minRows) padded.push({ year: '', month: '', text: '' });
  for (const row of padded) {
    const lines = w.wrap(row.text, textW, BODY_SIZE);
    const h = Math.max(ROW_H, lines.length * BODY_SIZE * 1.45 + 3 * MM);
    if (w.ensure(h)) drawHistoryHeader(w, `${title}（つづき）`);
    w.rect(x, w.y, CONTENT_W, h);
    w.vline(x + YEAR_W, w.y, h);
    w.vline(x + YEAR_W + MONTH_W, w.y, h);
    const first = w.y - (h - (lines.length - 1) * BODY_SIZE * 1.45) / 2 - BODY_SIZE * 0.35;
    w.textCenter(row.year, x, YEAR_W, first, BODY_SIZE);
    w.textCenter(row.month, x + YEAR_W, MONTH_W, first, BODY_SIZE);
    lines.forEach((line, index) => {
      const y = first - index * BODY_SIZE * 1.45;
      if (row.align === 'center') w.textCenter(line, textX, textW, y, BODY_SIZE);
      else if (row.align === 'right') w.textRight(line, textX + textW, y, BODY_SIZE);
      else w.text(line, textX, y, BODY_SIZE);
    });
    w.y -= h;
  }
}

/** A titled free-text box that may continue across pages, line by line. */
function drawTextBox(w: Writer, title: string, paragraphs: { heading?: string; body: string }[], minHeight: number) {
  const x = MARGIN_X;
  const pad = 3 * MM;
  const lineH = BODY_SIZE * 1.6;
  const lines: { text: string; heading?: boolean }[] = [];
  for (const paragraph of paragraphs) {
    if (lines.length) lines.push({ text: '' });
    if (paragraph.heading) lines.push({ text: `【${paragraph.heading}】`, heading: true });
    for (const line of w.wrap(paragraph.body, CONTENT_W - pad * 2, BODY_SIZE)) lines.push({ text: line });
  }
  const titleLines = w.wrap(title, CONTENT_W - pad * 2, 7.5);
  const titleH = titleLines.length * 7.5 * 1.4 + pad;

  let index = 0;
  let firstSegment = true;
  while (firstSegment || index < lines.length) {
    w.ensure(titleH + lineH * 2 + pad);
    const top = w.y;
    let y = top - pad - 7.5;
    for (const line of titleLines) { w.text(line, x + pad, y, 7.5, SOFT); y -= 7.5 * 1.4; }
    y -= pad / 2;
    while (index < lines.length && y - lineH >= MARGIN_BOTTOM) {
      const line = lines[index];
      w.text(line.text, x + pad, y - BODY_SIZE * 0.2, BODY_SIZE, line.heading ? SOFT : INK);
      y -= lineH;
      index += 1;
    }
    const used = top - y + pad;
    const height = firstSegment && index >= lines.length ? Math.max(used, minHeight) : used;
    const clamped = Math.min(height, top - MARGIN_BOTTOM);
    w.rect(x, top, CONTENT_W, clamped);
    w.y = top - clamped - 4 * MM;
    firstSegment = false;
    if (index < lines.length) w.newPage();
  }
}

export async function renderResumePdf(model: ResumeModel, photo: ResumePhoto | null): Promise<PdfResult> {
  const w = await createWriter('履歴書');
  const x = MARGIN_X;
  const photoW = 30 * MM;
  const photoH = 40 * MM;
  const leftW = CONTENT_W - photoW - 6 * MM;

  // Title and date.
  w.text('履 歴 書', x, w.y - 18, 18);
  w.textRight(model.createdOn, x + leftW, w.y - 16, 9);
  w.y -= 26;

  // Personal block with the photo frame on the right.
  const blockTop = w.y;
  const kanaH = 7.5 * MM;
  const nameH = 17 * MM;
  const birthH = 9 * MM;
  w.rect(x, blockTop, leftW, kanaH + nameH + birthH, { thickness: 0.9 });
  w.hline(x, blockTop - kanaH, leftW, 0.3);
  w.hline(x, blockTop - kanaH - nameH, leftW);
  w.text('ふりがな', x + 2 * MM, blockTop - kanaH / 2 - 2.5, 7, SOFT);
  w.text(w.wrap(model.nameKana, leftW - 22 * MM, 9.5)[0] ?? '', x + 18 * MM, blockTop - kanaH / 2 - 3.2, 9.5);
  w.text('氏　名', x + 2 * MM, blockTop - kanaH - 5 * MM, 7.5, SOFT);
  const nameSize = Math.min(20, ((leftW - 22 * MM) / Math.max(1, w.width(w.safe(model.name), 20))) * 20);
  w.text(model.name, x + 18 * MM, blockTop - kanaH - nameH / 2 - nameSize * 0.35, nameSize);
  const birthY = blockTop - kanaH - nameH - birthH / 2 - 3.3;
  w.text('生年月日', x + 2 * MM, birthY + 0.6, 7.5, SOFT);
  w.text(model.birthLine || '', x + 18 * MM, birthY, 10);
  if (model.gender) {
    w.vline(x + leftW - 30 * MM, blockTop - kanaH - nameH, birthH);
    w.text('性別', x + leftW - 28 * MM, birthY + 0.6, 7.5, SOFT);
    w.text(model.gender, x + leftW - 19 * MM, birthY, 10);
  }

  const photoX = x + CONTENT_W - photoW;
  if (photo) {
    const image: PDFImage = photo.type === 'image/png' ? await w.doc.embedPng(photo.bytes) : await w.doc.embedJpg(photo.bytes);
    w.page.drawImage(image, { x: photoX, y: blockTop - photoH, width: photoW, height: photoH });
  } else {
    w.page.drawRectangle({ x: photoX, y: blockTop - photoH, width: photoW, height: photoH, borderColor: SOFT, borderWidth: 0.5, borderDashArray: [2, 2] });
    w.textCenter('写真を貼る位置', photoX, photoW, blockTop - photoH / 2 + 4, 7, SOFT);
    w.textCenter('縦40mm × 横30mm', photoX, photoW, blockTop - photoH / 2 - 7, 6.5, SOFT);
  }
  w.y = Math.min(blockTop - kanaH - nameH - birthH, blockTop - photoH) - 4 * MM;

  // Address and contact.
  const contactW = 62 * MM;
  const addressW = CONTENT_W - contactW;
  const addressLines = w.wrap(model.address, addressW - 6 * MM, 10);
  const emailLines = w.wrap(model.email, contactW - 4 * MM, 8);
  const phoneH = 13 * MM;
  const emailH = 7.5 * MM + Math.max(1, emailLines.length) * 10.5;
  const addressH = Math.max(15 * MM, 7 * MM + addressLines.length * 14, phoneH + emailH - kanaH);
  const contactTop = w.y;
  w.rect(x, contactTop, CONTENT_W, kanaH + addressH, { thickness: 0.9 });
  w.vline(x + addressW, contactTop, kanaH + addressH);
  w.hline(x, contactTop - kanaH, addressW, 0.3);
  w.hline(x + addressW, contactTop - phoneH, contactW);
  w.text('ふりがな', x + 2 * MM, contactTop - kanaH / 2 - 2.5, 7, SOFT);
  w.text(w.wrap(model.addressKana, addressW - 22 * MM, 8.5)[0] ?? '', x + 18 * MM, contactTop - kanaH / 2 - 3, 8.5);
  w.text(`現住所　〒${model.postalCode}`, x + 2 * MM, contactTop - kanaH - 5 * MM, 8.5);
  addressLines.forEach((line, index) => w.text(line, x + 3 * MM, contactTop - kanaH - 10.5 * MM - index * 14, 10));
  w.text('電話', x + addressW + 2 * MM, contactTop - 4.5 * MM, 7.5, SOFT);
  w.text(model.phone, x + addressW + 2 * MM, contactTop - 10 * MM, 10);
  w.text('E-mail', x + addressW + 2 * MM, contactTop - phoneH - 4.5 * MM, 7.5, SOFT);
  emailLines.forEach((line, index) => w.text(line, x + addressW + 2 * MM, contactTop - phoneH - 8.5 * MM - index * 10.5, 8));
  w.y = contactTop - kanaH - addressH;

  if (model.contactAddress) {
    const lines = w.wrap(model.contactAddress, CONTENT_W - 6 * MM, 9.5);
    const h = 7 * MM + lines.length * 13;
    w.rect(x, w.y, CONTENT_W, h, { thickness: 0.9 });
    w.text('連絡先（現住所以外に連絡を希望する場合）', x + 2 * MM, w.y - 4 * MM, 7.5, SOFT);
    lines.forEach((line, index) => w.text(line, x + 3 * MM, w.y - 9 * MM - index * 13, 9.5));
    w.y -= h;
  }
  w.y -= 5 * MM;

  drawHistoryTable(w, '学歴・職歴', model.history, 8);
  w.y -= 5 * MM;
  drawHistoryTable(w, '免許・資格', model.licenses.length ? model.licenses : [{ year: '', month: '', text: '特になし' }], 3);
  w.y -= 5 * MM;
  drawTextBox(w, '志望の動機、自己PR、得意なことなど', model.appeal.length ? model.appeal : [{ body: '' }], 40 * MM);
  drawTextBox(w, '本人希望記入欄（給料・職種・勤務時間・勤務地・その他についての希望があれば記入）', [{ body: model.requests }], 20 * MM);

  return finish(w);
}

/* ------------------------------- 職務経歴書 ------------------------------- */

function sectionTitle(w: Writer, title: string) {
  w.ensure(16 * MM);
  w.y -= 4 * MM;
  w.text(`■ ${title}`, MARGIN_X, w.y - 11, 11.5);
  w.y -= 15;
  w.hline(MARGIN_X, w.y, CONTENT_W, 0.8);
  w.y -= 3 * MM;
}

function paragraph(w: Writer, value: string, indent = 2 * MM, size = BODY_SIZE) {
  const lineH = size * 1.65;
  for (const line of w.wrap(value, CONTENT_W - indent * 2, size)) {
    w.ensure(lineH);
    w.text(line, MARGIN_X + indent, w.y - size, size);
    w.y -= lineH;
  }
}

function facts(w: Writer, rows: [string, string][], indent = 2 * MM) {
  const labelW = 32 * MM;
  for (const [label, value] of rows) {
    const lines = w.wrap(value, CONTENT_W - indent - labelW - 2 * MM, BODY_SIZE);
    lines.forEach((line, index) => {
      w.ensure(BODY_SIZE * 1.65);
      if (index === 0) w.text(label, MARGIN_X + indent, w.y - BODY_SIZE, BODY_SIZE, SOFT);
      w.text(line, MARGIN_X + indent + labelW, w.y - BODY_SIZE, BODY_SIZE);
      w.y -= BODY_SIZE * 1.65;
    });
  }
}

export async function renderWorkHistoryPdf(model: WorkHistoryModel): Promise<PdfResult> {
  const w = await createWriter('職務経歴書');
  w.textCenter('職 務 経 歴 書', 0, PAGE_W, w.y - 18, 17);
  w.y -= 30;
  w.textRight(model.createdOn, MARGIN_X + CONTENT_W, w.y - 9, 9);
  w.y -= 14;
  w.textRight(`氏名　${model.name}`, MARGIN_X + CONTENT_W, w.y - 10, 10);
  w.y -= 12;

  for (const section of model.sections) {
    sectionTitle(w, section.title);
    if (section.kind === 'paragraph') paragraph(w, section.text);
    if (section.kind === 'facts') facts(w, section.facts);
    if (section.kind === 'list') for (const item of section.items) paragraph(w, `・${item}`);
    if (section.kind === 'jobs') {
      for (const job of section.jobs) {
        const orgLines = w.wrap(job.organization, CONTENT_W - 6 * MM, 11);
        const subLines = job.subtitle ? w.wrap(job.subtitle, CONTENT_W - 6 * MM, 8.5) : [];
        const headH = 4 * MM + (job.period ? 12 : 0) + orgLines.length * 15 + subLines.length * 12;
        w.ensure(headH + 20 * MM);
        w.rect(MARGIN_X, w.y, CONTENT_W, headH, { fill: true, thickness: 0.3 });
        let y = w.y - 2 * MM;
        if (job.period) { w.text(job.period, MARGIN_X + 3 * MM, y - 9, 9, SOFT); y -= 12; }
        for (const line of orgLines) { w.text(line, MARGIN_X + 3 * MM, y - 11.5, 11); y -= 15; }
        for (const line of subLines) { w.text(line, MARGIN_X + 3 * MM, y - 9, 8.5, SOFT); y -= 12; }
        w.y -= headH + 2.5 * MM;
        facts(w, job.facts, 3 * MM);
        for (const item of job.paragraphs) {
          w.ensure(BODY_SIZE * 3.5);
          w.y -= 1.5 * MM;
          w.text(`【${item.label}】`, MARGIN_X + 3 * MM, w.y - BODY_SIZE, BODY_SIZE, SOFT);
          w.y -= BODY_SIZE * 1.65;
          paragraph(w, item.text, 5 * MM);
        }
        w.y -= 4 * MM;
      }
    }
  }
  w.ensure(16);
  w.y -= 3 * MM;
  w.textRight('以上', MARGIN_X + CONTENT_W, w.y - 10, 10);
  return finish(w);
}
