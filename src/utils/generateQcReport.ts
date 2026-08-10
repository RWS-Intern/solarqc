import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { groupBySections } from '@/utils/qcSections';
import type { QcJob, SignOff } from '@/types/qc';

// A signed attestation — status, severity, remark per point, both
// signatures, the verdict — not a photo dossier. A QC job can carry up
// to 5 photos on each of 30+ photo-required points; embedding all of
// them would produce an enormous, slow-to-generate document that
// duplicates evidence already sitting in Cloudinary and already
// viewable in-app via EvidenceGallery (Phase 6). Fixed A4 in points.
const PAGE_WIDTH  = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN      = 40;
const FOOTER_H     = 24;
const CONTENT_BOTTOM = MARGIN + FOOTER_H;

const NAVY  = rgb(0x02 / 255, 0x3e / 255, 0x6b / 255);
const BLUE  = rgb(0x00 / 255, 0x77 / 255, 0xb6 / 255);
const GRAY  = rgb(0.45, 0.45, 0.45);
const LIGHT_GRAY = rgb(0.85, 0.85, 0.85);
const GREEN = rgb(0x2a / 255, 0x9d / 255, 0x8f / 255);
const AMBER = rgb(0xd9 / 255, 0x8f / 255, 0x0e / 255);
const RED   = rgb(0xe6 / 255, 0x39 / 255, 0x46 / 255);

// Characters confirmed present in real template data (qcTemplateSeed.ts)
// that this font can't render as-is get a readable ASCII substitute
// instead of a missing-glyph box. Anything else unsupported (a name in a
// script this font has no glyphs for at all, say) falls back to '?' per
// character — visibly broken rather than silently wrong, which matters
// more on a signed document than on a checklist screen.
const GLYPH_FALLBACKS: Record<string, string> = {
  '≤': '<=', '≥': '>=', '≠': '!=',
  '→': '->', '←': '<-',
};

function makeSanitizer(fontBytes: ArrayBuffer): (text: string) => string {
  // fontkit's own TS types call for a Node Buffer, but it only ever reads
  // the bytes — confirmed a plain Uint8Array (the browser-native
  // equivalent, no Buffer polyfill needed) works fine here.
  const fkFont = fontkit.create(new Uint8Array(fontBytes) as unknown as Buffer);
  return (text: string): string => {
    let out = '';
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (cp < 0x20 && cp !== 0x0a) continue;
      if (fkFont.hasGlyphForCodePoint(cp)) { out += ch; continue; }
      out += GLYPH_FALLBACKS[ch] ?? '?';
    }
    return out;
  };
}

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatDateOnly(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function roundLabel(reworkRound: number): string {
  return reworkRound === 0 ? 'Round 1' : `Round ${reworkRound + 1} — after rework`;
}

const VERDICT_STAMP: Record<string, { label: string; color: ReturnType<typeof rgb> }> = {
  pass:        { label: 'PASS',        color: GREEN },
  conditional: { label: 'CONDITIONAL', color: AMBER },
  reject:      { label: 'REJECT',      color: RED   },
};

interface Layout {
  doc:    PDFDocument;
  font:   PDFFont;
  bold:   PDFFont;
  san:    (s: string) => string;
  page:   PDFPage;
  y:      number;
  pageNum: number;
  qcNum:  string;
}

function addPage(ctx: Omit<Layout, 'page' | 'y' | 'pageNum'> & { pageNum: number }): { page: PDFPage; y: number } {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return { page, y: PAGE_HEIGHT - MARGIN };
}

function drawFooter(ctx: Layout, totalPagesPlaceholder: string, generatedAt: Date): void {
  ctx.page.drawLine({
    start: { x: MARGIN, y: MARGIN + FOOTER_H - 6 }, end: { x: PAGE_WIDTH - MARGIN, y: MARGIN + FOOTER_H - 6 },
    thickness: 0.5, color: LIGHT_GRAY,
  });
  ctx.page.drawText(ctx.san('© Rite Solar | Confidential'), {
    x: MARGIN, y: MARGIN, size: 8, font: ctx.font, color: GRAY,
  });
  ctx.page.drawText(ctx.san(`Generated ${formatDate(generatedAt)}`), {
    x: PAGE_WIDTH / 2 - 70, y: MARGIN, size: 8, font: ctx.font, color: GRAY,
  });
  const pageText = `Page ${ctx.pageNum} of ${totalPagesPlaceholder}`;
  const w = ctx.font.widthOfTextAtSize(pageText, 8);
  ctx.page.drawText(pageText, { x: PAGE_WIDTH - MARGIN - w, y: MARGIN, size: 8, font: ctx.font, color: GRAY });
}

function ensureSpace(ctx: Layout, needed: number): void {
  if (ctx.y - needed < CONTENT_BOTTOM) {
    const { page, y } = addPage(ctx);
    ctx.page = page;
    ctx.y = y;
    ctx.pageNum += 1;
  }
}

// Naive greedy word-wrap — pdf-lib draws single lines only, no built-in
// wrapping. Good enough for this document's line lengths; not meant to
// handle CJK or scripts without space-delimited words.
function wrapText(ctx: Layout, text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = ctx.san(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let line = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

function drawWrapped(
  ctx: Layout, text: string, x: number, maxWidth: number,
  opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; lineHeight?: number } = {},
): void {
  const size = opts.size ?? 9;
  const font = opts.font ?? ctx.font;
  const color = opts.color ?? rgb(0.1, 0.1, 0.1);
  const lineHeight = opts.lineHeight ?? size * 1.35;
  const lines = wrapText(ctx, text, font, size, maxWidth);
  for (const line of lines) {
    ensureSpace(ctx, lineHeight);
    ctx.page.drawText(line, { x, y: ctx.y - size, size, font, color });
    ctx.y -= lineHeight;
  }
}

function drawSectionTitle(ctx: Layout, title: string): void {
  ensureSpace(ctx, 26);
  ctx.y -= 6;
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 14, width: PAGE_WIDTH - MARGIN * 2, height: 18, color: rgb(0.94, 0.96, 0.99) });
  ctx.page.drawText(ctx.san(title), { x: MARGIN + 6, y: ctx.y - 10, size: 11, font: ctx.bold, color: NAVY });
  ctx.y -= 24;
}

async function embedSignature(doc: PDFDocument, url: string): Promise<Awaited<ReturnType<PDFDocument['embedPng']>> | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    return await doc.embedPng(bytes);
  } catch (err) {
    console.error('[generateQcReport] signature embed failed:', url, err);
    return null;
  }
}

export async function generateQcReport(job: QcJob): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const fontBytes = await fetch('/fonts/NotoSans-Regular.ttf').then((r) => r.arrayBuffer());
  const font = await doc.embedFont(fontBytes, { subset: true });
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const san  = makeSanitizer(fontBytes);

  const ctx: Layout = { doc, font, bold, san, page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: PAGE_HEIGHT - MARGIN, pageNum: 1, qcNum: job.qcNum };

  // ── Header ──────────────────────────────────────────────────────────
  ctx.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 80, width: PAGE_WIDTH, height: 80, color: NAVY });
  ctx.page.drawText(san('RITE SOLAR'), { x: MARGIN, y: PAGE_HEIGHT - 34, size: 18, font: bold, color: rgb(1, 1, 1) });
  ctx.page.drawText(san('Quality Control Certificate'), { x: MARGIN, y: PAGE_HEIGHT - 54, size: 11, font, color: rgb(0.85, 0.9, 1) });
  const qcNumText = san(job.qcNum);
  const qcNumW = bold.widthOfTextAtSize(qcNumText, 16);
  ctx.page.drawText(qcNumText, { x: PAGE_WIDTH - MARGIN - qcNumW, y: PAGE_HEIGHT - 34, size: 16, font: bold, color: rgb(1, 1, 1) });
  const roundText = san(roundLabel(job.reworkRound));
  const roundW = font.widthOfTextAtSize(roundText, 10);
  ctx.page.drawText(roundText, { x: PAGE_WIDTH - MARGIN - roundW, y: PAGE_HEIGHT - 54, size: 10, font, color: rgb(0.85, 0.9, 1) });

  const stamp = VERDICT_STAMP[job.verdict ?? ''] ?? null;
  if (stamp) {
    const stampText = stamp.label;
    const sw = bold.widthOfTextAtSize(stampText, 12) + 16;
    ctx.page.drawRectangle({ x: PAGE_WIDTH - MARGIN - sw, y: PAGE_HEIGHT - 74, width: sw, height: 16, color: stamp.color });
    ctx.page.drawText(stampText, { x: PAGE_WIDTH - MARGIN - sw + 8, y: PAGE_HEIGHT - 70, size: 12, font: bold, color: rgb(1, 1, 1) });
  }
  ctx.y = PAGE_HEIGHT - 100;

  // ── Customer & system ────────────────────────────────────────────────
  drawSectionTitle(ctx, 'Customer & System');
  const col2X = MARGIN + (PAGE_WIDTH - MARGIN * 2) / 2;
  const leftLines = [
    `Customer: ${job.customer.name || '—'}`,
    `Address: ${job.customer.address || '—'}`,
    `District / State: ${[job.customer.district, job.customer.state].filter(Boolean).join(', ') || '—'}`,
    `Mobile: ${job.customer.mobile || '—'}`,
  ];
  const rightLines = [
    `System size: ${job.system.sizeKw ? `${job.system.sizeKw} kW` : '—'}`,
    `Module: ${job.system.moduleMake || '—'}${job.system.moduleWattage ? ` (${job.system.moduleWattage}W x ${job.system.moduleCount ?? '?'})` : ''}`,
    `Inverter: ${job.system.inverterMake || '—'}${job.system.inverterModel ? ` ${job.system.inverterModel}` : ''}`,
    `Installation date: ${job.system.installationDate || '—'}`,
  ];
  const blockStartY = ctx.y;
  for (const line of leftLines) drawWrapped(ctx, line, MARGIN, col2X - MARGIN - 10, { size: 9.5 });
  const afterLeftY = ctx.y;
  ctx.y = blockStartY;
  for (const line of rightLines) drawWrapped(ctx, line, col2X, PAGE_WIDTH - MARGIN - col2X, { size: 9.5 });
  ctx.y = Math.min(ctx.y, afterLeftY) - 6;

  drawSectionTitle(ctx, 'Inspection');
  drawWrapped(ctx, `Inspector: ${job.inspectorName || '—'}${job.inspectorCode ? ` (${job.inspectorCode})` : ''}`, MARGIN, PAGE_WIDTH - MARGIN * 2, { size: 9.5 });
  drawWrapped(ctx, `Inspection date: ${formatDateOnly(job.submittedAt)}`, MARGIN, PAGE_WIDTH - MARGIN * 2, { size: 9.5 });
  drawWrapped(ctx, `Approver: ${job.approverName || '—'}`, MARGIN, PAGE_WIDTH - MARGIN * 2, { size: 9.5 });
  ctx.y -= 4;

  // ── Checklist ─────────────────────────────────────────────────────────
  drawSectionTitle(ctx, 'Checklist');
  const sections = groupBySections(job.template);
  for (const section of sections) {
    if (section.fields.length === 0) continue;
    ensureSpace(ctx, 20);
    ctx.page.drawText(san(section.title), { x: MARGIN, y: ctx.y - 10, size: 10, font: bold, color: BLUE });
    ctx.y -= 18;

    for (const field of section.fields) {
      const ans = job.answers[field.fieldId];
      const status = ans?.status ?? null;
      const statusLabel = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : status === 'na' ? 'N/A' : '—';
      const statusColor = status === 'pass' ? GREEN : status === 'fail' ? RED : GRAY;
      const severityLabel = field.severity ? `[${field.severity.toUpperCase()}]` : '';

      ensureSpace(ctx, 14);
      const codeLabel = `${field.code ? field.code + ' ' : ''}${field.label}`;
      drawWrapped(ctx, codeLabel, MARGIN, PAGE_WIDTH - MARGIN * 2 - 130, { size: 9, font: bold });
      // Status + severity, right-aligned on the label's first line.
      const tagText = `${statusLabel} ${severityLabel}`.trim();
      const tagW = font.widthOfTextAtSize(tagText, 8.5);
      ctx.page.drawText(tagText, {
        x: PAGE_WIDTH - MARGIN - tagW, y: ctx.y + (9 * 1.35) - 9, size: 8.5, font, color: statusColor,
      });

      const value = ans?.value ?? (ans?.numericValue !== undefined ? `${ans.numericValue}${field.unit ? ` ${field.unit}` : ''}` : '');
      if (value) drawWrapped(ctx, `Value: ${value}`, MARGIN + 10, PAGE_WIDTH - MARGIN * 2 - 10, { size: 8.5, color: GRAY });
      if (ans?.remark) drawWrapped(ctx, `Remark: ${ans.remark}`, MARGIN + 10, PAGE_WIDTH - MARGIN * 2 - 10, { size: 8.5, color: GRAY });
      ctx.y -= 4;
    }
    ctx.y -= 6;
  }

  // ── Tally summary ────────────────────────────────────────────────────
  drawSectionTitle(ctx, 'Summary');
  const t = job.tally;
  drawWrapped(ctx, `Answered: ${t.answered} / ${t.total}    Pass: ${t.pass}    Fail: ${t.fail}    N/A: ${t.na}`, MARGIN, PAGE_WIDTH - MARGIN * 2, { size: 9.5 });
  drawWrapped(ctx, `Critical fails: ${t.criticalFail}    Major fails: ${t.majorFail}    Minor fails: ${t.minorFail}`, MARGIN, PAGE_WIDTH - MARGIN * 2, { size: 9.5 });
  ctx.y -= 4;

  // ── Verdict ──────────────────────────────────────────────────────────
  drawSectionTitle(ctx, 'Verdict');
  drawWrapped(ctx, `Verdict: ${stamp?.label ?? '—'}`, MARGIN, PAGE_WIDTH - MARGIN * 2, { size: 9.5, font: bold, color: stamp?.color });
  if (job.verdictNote) drawWrapped(ctx, `Note: ${job.verdictNote}`, MARGIN, PAGE_WIDTH - MARGIN * 2, { size: 9.5 });
  if (job.conditions) drawWrapped(ctx, `Conditions: ${job.conditions}`, MARGIN, PAGE_WIDTH - MARGIN * 2, { size: 9.5 });
  ctx.y -= 4;

  // ── Sign-offs ────────────────────────────────────────────────────────
  drawSectionTitle(ctx, 'Sign-off');
  const signOffs: Array<[string, SignOff | null]> = [
    ['Inspector', job.inspectorSignOff],
    ['Approver',  job.approverSignOff],
    ['Customer',  job.customerSignOff],
  ];
  const sigW = 130, sigH = 55, gap = 20;
  let sx = MARGIN;
  ensureSpace(ctx, sigH + 30);
  const rowTop = ctx.y;
  for (const [roleLabel, signOff] of signOffs) {
    if (sx + sigW > PAGE_WIDTH - MARGIN) { sx = MARGIN; ctx.y -= (sigH + 34); ensureSpace(ctx, sigH + 30); }
    if (signOff) {
      const img = await embedSignature(doc, signOff.signatureUrl);
      if (img) {
        const scale = Math.min(sigW / img.width, sigH / img.height, 1);
        const w = img.width * scale, h = img.height * scale;
        ctx.page.drawImage(img, { x: sx, y: ctx.y - sigH + (sigH - h) / 2, width: w, height: h });
      }
      ctx.page.drawLine({ start: { x: sx, y: ctx.y - sigH - 2 }, end: { x: sx + sigW, y: ctx.y - sigH - 2 }, thickness: 0.5, color: LIGHT_GRAY });
      ctx.page.drawText(san(`${roleLabel}: ${signOff.name}`), { x: sx, y: ctx.y - sigH - 14, size: 8, font: bold, color: rgb(0.1, 0.1, 0.1) });
      ctx.page.drawText(san(formatDate(signOff.signedAt)), { x: sx, y: ctx.y - sigH - 24, size: 7.5, font, color: GRAY });
    } else {
      ctx.page.drawText(san(`${roleLabel}: not signed`), { x: sx, y: ctx.y - sigH + (sigH / 2), size: 8, font, color: GRAY });
    }
    sx += sigW + gap;
  }
  ctx.y = rowTop - sigH - 34;

  // ── Footer on every page ─────────────────────────────────────────────
  const totalPages = ctx.doc.getPageCount();
  const generatedAt = new Date();
  const allPages = ctx.doc.getPages();
  for (let i = 0; i < allPages.length; i++) {
    const footerCtx: Layout = { ...ctx, page: allPages[i], pageNum: i + 1 };
    drawFooter(footerCtx, String(totalPages), generatedAt);
  }

  const bytes = await doc.save();
  return new Blob([bytes] as BlobPart[], { type: 'application/pdf' });
}
