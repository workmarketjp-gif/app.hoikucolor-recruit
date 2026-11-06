/**
 * Offline, source-owned A4 HTML for the Expo native print engine. The source is
 * the read-back-verified ResumeReview, never an unsaved draft. Text and photo
 * are embedded: WKWebView on iOS cannot print local asset URLs reliably.
 *
 * This is a Native print layout, not the Web pdf-lib renderer. Per-OS printed
 * A4/line-wrap parity must be visually tested before release acceptance.
 */
import type { ResumeReview, ReviewRow, ReviewSection } from './resumeReviewModel';
import { resumePdfIdentityRows } from './resumePdfIdentity';

export type ResumeA4Kind = 'resume' | 'work_history';
const esc = (v: string): string => v.replace(/[&<>"']/g, (ch) => (
  ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const val = (v: string | null | undefined) => esc((v ?? '').trim() || '—');
const textBlock = (v: string) => `<p class="body">${val(v)}</p>`;
const detail = (label: string, value: string) => `<tr><th scope="row">${esc(label)}</th><td>${val(value)}</td></tr>`;
const section = (title: string, body: string) => `<section class="section"><h2>${esc(title)}</h2>${textBlock(body)}</section>`;
const reviewRows = (rows: ReviewRow[], title: string) => `<table class="history"><thead><tr><th>年</th><th>月</th><th>${esc(title)}</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.year || '')}</td><td>${esc(r.month || '')}</td><td class="${r.align === 'center' ? 'center' : r.align === 'right' ? 'right' : ''}">${val(r.label)}</td></tr>`).join('')}</tbody></table>`;
const reviewSections = (items: ReviewSection[]) => items.map((s) => section(s.title, s.lines.join('\n'))).join('');

/** Accept only an already-sanitized JPEG/PNG inline preview, never file:/// or https://. */
export function assertInlineResumePhoto(dataUri: string | null | undefined): string | null {
  if (!dataUri) return null;
  if (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUri) || dataUri.length > 14_000_000) {
    throw new Error('証明写真の安全なデータを確認できませんでした。もう一度選択してください。');
  }
  return dataUri;
}

export function buildResumeA4Html(kind: ResumeA4Kind, review: ResumeReview, photoDataUri?: string | null): string {
  if (kind !== 'resume' && kind !== 'work_history') throw new Error('書類の種類を確認できませんでした。');
  if (!review.name.trim()) throw new Error('お名前を入力してからPDFを作成してください。');
  const photo = kind === 'resume' ? assertInlineResumePhoto(photoDataUri) : null;
  const title = kind === 'resume' ? '履歴書' : '職務経歴書';
  // The compact preview's slash-joined strings must never replace distinct
  // phone, email and address fields in the formal document (Web PDF parity).
  const contactRows = review.pdfIdentity
    ? resumePdfIdentityRows(review.pdfIdentity).map(({ label, value }) => detail(label, value)).join('')
    : `${detail('現住所', review.address)}${detail('連絡先', review.contact)}`;
  const content = kind === 'resume' ? `
    <div class="personal"><div class="personal-data"><table class="details">
      ${detail('ふりがな', review.kana)}${detail('氏名', review.name)}${detail('生年月日', review.birth)}
      ${review.gender.trim() ? detail('性別', review.gender) : ''}
      ${contactRows}
    </table></div><div class="photo">${photo ? `<img src="${photo}" alt="証明写真">` : '<span>写真</span>'}</div></div>
    ${reviewRows(review.history, '学歴・職歴')}
    ${reviewRows(review.licenses.length ? review.licenses : [{ year: '', month: '', label: '特になし' }], '免許・資格（本人申告）')}
    ${reviewSections(review.appeal)}${section('本人希望記入欄', review.requests)}` : `
    <table class="details">${detail('氏名', review.name)}</table>
    ${review.work.length ? reviewSections(review.work) : section('職務経歴', '職務経歴・自己PRの登録がありません。')}`;
  // Only HTML text derived from the canonical review and optional inline sanitized
  // photo can enter the print engine. No remote font, script, link or fetch.
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page { size: A4 portrait; margin: 14mm 15mm 16mm; }
html,body { margin:0; padding:0; background:#fff; color:#1a2029; }
body { font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans CJK JP", sans-serif; font-size:9.5pt; line-height:1.5; -webkit-print-color-adjust:exact; print-color-adjust:exact; overflow-wrap:anywhere; }
header { display:flex; align-items:baseline; justify-content:space-between; gap:10mm; padding-bottom:4mm; }
h1 { margin:0; font-size:18pt; letter-spacing:.1em; font-weight:700; } header time { font-size:9pt; color:#444; }
h2 { font-size:10pt; margin:0 0 2mm; padding:2mm; border-bottom:1px solid #444; background:#f0f0f2; }
section { margin-top:5mm; } p { margin:0; } .body { white-space:pre-wrap; word-break:break-word; }
table { width:100%; border-collapse:collapse; margin-top:4mm; table-layout:fixed; }
th,td { border:1px solid #555; padding:1.7mm 2mm; vertical-align:top; overflow-wrap:anywhere; }
th { font-weight:600; background:#f1f1f3; }
.details th { width:28mm; text-align:left; } .details { margin:0; }
.personal { display:flex; gap:4mm; align-items:flex-start; } .personal-data { flex:1; min-width:0; }
.photo { width:30mm; height:40mm; flex:none; border:1px solid #555; display:flex; align-items:center; justify-content:center; color:#555; }
.photo img { width:100%; height:100%; object-fit:cover; } .history th:first-child,.history td:first-child { width:14mm; text-align:center; }
.history th:nth-child(2),.history td:nth-child(2) { width:10mm; text-align:center; }
.center { text-align:center; } .right { text-align:right; }
tr { break-inside:avoid; page-break-inside:avoid; } h2 { break-after:avoid; page-break-after:avoid; }
</style></head><body><header><h1>${title}</h1><time>${val(review.createdOn)}</time></header>${content}</body></html>`;
}
