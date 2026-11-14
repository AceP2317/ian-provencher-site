/* file-import.js — a file he adds in the Writer tab, read to Markdown in the browser (2026-11-01).
   Text and Markdown are read as they are. A Word file (.docx) is a zip, and its word/document.xml
   becomes Markdown here: free, exact, and nothing is uploaded. A PDF or a picture cannot be read
   faithfully here, so it goes to the Worker's read-file route, which asks the model to transcribe it.
   Old formats (.doc, .rtf, .odt, .pages) are refused with the way round: save it as PDF or Word. */
import { mdToDocx, storeZip, crc32 } from './draft-export.js';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 5;
// Anthropic reads a picture up to 10 MB once base64-encoded, which is about 7.5 MB of picture; the
// Worker's read-file route (worker/lib/read-file.mjs) refuses past that, so the page refuses first.
export const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const MAX_PART_BYTES = 60 * 1024 * 1024; // a part claiming more than this is refused before inflating
export const MODEL_TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const TEXT_EXT = /\.(txt|md|markdown|text)$/i;
const WORD_EXT = /\.(docx|docm|dotx)$/i;
const OLD_EXT = /\.(doc|rtf|odt|pages|wps)$/i;
export const ACCEPT = '.pdf,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg,.webp,.gif';
const SAVE_AS = 'save it as PDF or Word (.docx) and add it again';

const extOf = (name) => (String(name).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** How a file is read: 'text', 'word' or 'model' (with its media type), or why it cannot be. */
export function kindOf(name, size = 0) {
  if (size > MAX_FILE_BYTES) return { refused: `${name} is ${mb(size)}, and a file can be at most ${mb(MAX_FILE_BYTES)}.` };
  if (TEXT_EXT.test(name)) return { kind: 'text' };
  if (WORD_EXT.test(name)) return { kind: 'word' };
  if (OLD_EXT.test(name)) return { refused: `${name} is in an older format this page cannot read: ${SAVE_AS}.` };
  const media = MODEL_TYPES[extOf(name)];
  if (media && media !== 'application/pdf' && size > MAX_IMAGE_BYTES) return { refused: `${name} is ${mb(size)}, and a picture can be at most ${mb(MAX_IMAGE_BYTES)}, the most Anthropic reads. Save it smaller, or as PDF.` };
  if (media) return { kind: 'model', mediaType: media };
  return { refused: `${name} is not a file this page can read. Add a PDF, Word (.docx), text, Markdown or picture file, or ${SAVE_AS}.` };
}

// ── text ──────────────────────────────────────────────────────────────────────────────────────────
// UTF-8 first; a file Windows saved in its own code page fails that and is read as Windows-1252.
export function decodeText(bytes) {
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1252').decode(bytes); }
}

// ── the zip a .docx is ────────────────────────────────────────────────────────────────────────────
const NOT_WORD = `It could not be opened as a Word file. If it came from Word, ${SAVE_AS}.`;
export function zipEntries(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let k = bytes.length - 22; k >= Math.max(0, bytes.length - 65_557); k--) if (dv.getUint32(k, true) === 0x06054b50) { end = k; break; }
  if (end < 0) throw new Error(NOT_WORD);
  const count = dv.getUint16(end + 10, true);
  let at = dv.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || dv.getUint32(at, true) !== 0x02014b50) throw new Error(NOT_WORD);
    const nameLen = dv.getUint16(at + 28, true);
    const e = { flags: dv.getUint16(at + 8, true), method: dv.getUint16(at + 10, true), comp: dv.getUint32(at + 20, true), size: dv.getUint32(at + 24, true), headerAt: dv.getUint32(at + 42, true) };
    out.set(dec.decode(bytes.subarray(at + 46, at + 46 + nameLen)), e);
    at += 46 + nameLen + dv.getUint16(at + 30, true) + dv.getUint16(at + 32, true);
  }
  return out;
}
async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function zipPart(bytes, entries, name) {
  const e = entries.get(name);
  if (!e) return null;
  if (e.flags & 1) throw new Error(`It is password-protected. Remove the password in Word, or ${SAVE_AS}.`);
  if (e.size > MAX_PART_BYTES) throw new Error(`Its ${name} says it unpacks to ${mb(e.size)}, which is more than a document holds, so it was not opened.`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(e.headerAt, true) !== 0x04034b50) throw new Error(NOT_WORD);
  const start = e.headerAt + 30 + dv.getUint16(e.headerAt + 26, true) + dv.getUint16(e.headerAt + 28, true);
  const data = bytes.subarray(start, start + e.comp);
  if (e.method === 0) return data;
  if (e.method === 8) return inflate(data);
  throw new Error(`Its ${name} is packed in a way this page cannot read: ${SAVE_AS}.`);
}

// ── Word's XML ────────────────────────────────────────────────────────────────────────────────────
const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITY[e.toLowerCase()]));
function* tokens(xml) {
  for (const m of xml.matchAll(TOKEN)) {
    if (m[1] !== undefined) yield { text: m[1] };
    else if (m[3]) {
      const attrs = {};
      for (const a of m[4].matchAll(ATTR)) attrs[a[1]] = unescape(a[2] ?? a[3] ?? '');
      yield { tag: m[3], close: m[2] === '/', empty: m[5] === '/', attrs };
    } else if (m[6] !== undefined) yield { text: unescape(m[6]) };
  }
}
const on = (attrs) => !/^(0|false|off|none)$/i.test(attrs['w:val'] ?? '1');

// Paragraph styles: name, the style it is based on, its outline level and any numbering it carries.
export function readStyles(xml) {
  const styles = new Map();
  let cur = null, depth = 0;
  for (const t of tokens(xml || '')) {
    if (!t.tag) continue;
    if (t.tag === 'w:style' && !t.close) { cur = { id: t.attrs['w:styleId'], type: t.attrs['w:type'] }; if (t.empty) cur = null; continue; }
    if (t.tag === 'w:style' && t.close) { if (cur?.id && cur.type === 'paragraph') styles.set(cur.id, cur); cur = null; continue; }
    if (!cur) continue;
    if (t.tag === 'w:rPr') { if (!t.empty) depth += t.close ? -1 : 1; continue; }
    if (t.close || depth) continue;
    if (t.tag === 'w:name') cur.name = t.attrs['w:val'];
    else if (t.tag === 'w:basedOn') cur.basedOn = t.attrs['w:val'];
    else if (t.tag === 'w:outlineLvl') cur.outline = Number(t.attrs['w:val']);
    else if (t.tag === 'w:numId') cur.numId = t.attrs['w:val'];
    else if (t.tag === 'w:ilvl') cur.ilvl = Number(t.attrs['w:val']);
  }
  return styles;
}
// Each list: whether it is numbered, and where it starts, at each level.
export function readNumbering(xml) {
  const abstract = new Map(), nums = new Map();
  let abs = null, lvl = null, num = null, override = null;
  for (const t of tokens(xml || '')) {
    if (!t.tag) continue;
    if (t.tag === 'w:abstractNum') { if (t.close) abs = null; else { abs = new Map(); abstract.set(t.attrs['w:abstractNumId'], abs); } continue; }
    if (t.tag === 'w:num') { if (t.close) num = null; else { num = { abs: null, start: new Map() }; nums.set(t.attrs['w:numId'], num); } continue; }
    if (t.tag === 'w:lvl' && abs) { if (t.close) lvl = null; else { lvl = { fmt: 'decimal', start: 1 }; abs.set(Number(t.attrs['w:ilvl']), lvl); } continue; }
    if (t.tag === 'w:lvlOverride' && num) { override = t.close ? null : Number(t.attrs['w:ilvl']); continue; }
    if (t.close) continue;
    if (t.tag === 'w:numFmt' && lvl) lvl.fmt = t.attrs['w:val'];
    else if (t.tag === 'w:start' && lvl) lvl.start = Number(t.attrs['w:val']);
    else if (t.tag === 'w:abstractNumId' && num) num.abs = t.attrs['w:val'];
    else if (t.tag === 'w:startOverride' && num && override !== null) num.start.set(override, Number(t.attrs['w:val']));
  }
  return (numId, ilvl) => {
    const n = nums.get(String(numId));
    const l = n && abstract.get(n.abs)?.get(ilvl);
    if (!n || !l || l.fmt === 'none') return null;
    return { ordered: l.fmt !== 'bullet', start: n.start.get(ilvl) ?? l.start };
  };
}
export function readRels(xml) {
  const rels = new Map();
  for (const t of tokens(xml || '')) if (t.tag === 'Relationship' && !t.close) rels.set(t.attrs.Id, t.attrs.Target);
  return rels;
}

// A heading level from a style: 0 is the title, 1 the first heading under it.
function headingOf(styles, id, seen = 0) {
  const s = styles.get(id);
  if (!s || seen > 6) return null;
  if (/^title$/i.test(s.name || '')) return 0;
  const h = (s.name || '').match(/^heading\s*(\d)$/i);
  if (h) return Number(h[1]);
  if (Number.isInteger(s.outline) && s.outline < 9) return s.outline + 1;
  return s.basedOn ? headingOf(styles, s.basedOn, seen + 1) : null;
}
function styleList(styles, id, seen = 0) {
  const s = styles.get(id);
  if (!s || seen > 6) return null;
  if (s.numId) return { numId: s.numId, ilvl: s.ilvl || 0 };
  const m = (s.name || '').match(/^list (bullet|number)/i);
  if (m) return { manual: m[1].toLowerCase() === 'number' ? 'ordered' : 'bullet', ilvl: 0 };
  return s.basedOn ? styleList(styles, s.basedOn, seen + 1) : null;
}

// Runs to one Markdown line each: formatting is closed at every break, and spaces sit outside the marks.
const TYPED_BULLET = /^\s*[•◦▪▫‣●○■□–\-*]\s+/;
const BULLET_EMU = 228_600; // a quarter inch; Word measures a picture in EMU, 914,400 to the inch
function inline(runs) {
  const lines = [[]];
  for (const r of runs) {
    r.text.split('\n').forEach((part, k) => {
      if (k) lines.push([]);
      if (!part) return;
      const line = lines[lines.length - 1];
      const last = line[line.length - 1];
      if (last && last.b === r.b && last.i === r.i && last.href === r.href) last.text += part;
      else line.push({ ...r, text: part });
    });
  }
  // The writer's own Word export prints a link's address after its label; read back, that is said once.
  for (const segs of lines) {
    for (let k = 1; k < segs.length; k++) {
      const after = segs[k - 1].href && ` (${segs[k - 1].href})`;
      if (after && !segs[k].href && segs[k].text.startsWith(after)) segs[k].text = segs[k].text.slice(after.length);
    }
  }
  return lines.map((segs) => segs.filter((s) => s.text).map((s) => {
    const text = s.text.replace(/\t+/g, '\t');
    const lead = text.match(/^\s*/)[0], trail = text.slice(lead.length).match(/\s*$/)[0];
    let core = text.slice(lead.length, text.length - trail.length);
    if (core && (s.b || s.i)) core = `${s.b && s.i ? '***' : s.b ? '**' : '*'}${core}${s.b && s.i ? '***' : s.b ? '**' : '*'}`;
    if (core && s.href) core = `[${core}](${s.href})`;
    return lead + core + trail;
  }).join('').replace(/^[\t ]+|[\t ]+$/g, '').replace(/^([•◦▪▫‣●○■□–*-])\t+/, '$1 ').replace(/[ ]*\t[\t ]*/g, ' · ').replace(/ {2,}/g, ' '));
}

/** One Word part's paragraphs as blocks, in document order, text boxes and tables included. */
export function partBlocks(xml, { styles = new Map(), list = () => null, rels = new Map() } = {}, note = {}) {
  const top = [];
  const paras = [];   // the paragraph being read, and any it encloses through a text box
  const tables = [];  // { rows: [[cell]] }, each cell a list of blocks
  let skip = 0, inPPr = 0, inRPr = 0, inText = false;
  const SKIP = new Set(['mc:Fallback', 'w:instrText', 'w:delText', 'w:sectPr']);
  const sink = () => {
    const t = tables[tables.length - 1];
    const row = t?.rows[t.rows.length - 1];
    return row?.length ? row[row.length - 1] : top;
  };
  const emit = (p) => {
    const lines = inline(p.runs);
    const text = lines.join('\n').trim();
    let level = headingOf(styles, p.style);
    if (Number.isInteger(p.outline) && p.outline < 9) level = p.outline + 1;
    const fromStyle = styleList(styles, p.style);
    const numId = p.numId ?? fromStyle?.numId;
    const ilvl = p.ilvl ?? fromStyle?.ilvl ?? 0;
    const kind = numId && numId !== '0' ? list(numId, ilvl) : fromStyle?.manual ? { ordered: fromStyle.manual === 'ordered', start: 1 } : null;
    if (!text) return;
    if (level !== null && level !== undefined && !kind) { sink().push({ type: 'heading', level, text: lines.join(' ').trim() }); return; }
    if (kind) { sink().push({ type: 'item', ordered: kind.ordered, start: kind.start, key: `${numId ?? p.style}:${ilvl}`, depth: Math.min(ilvl, 1), text: lines.join(' ').trim() }); return; }
    if (TYPED_BULLET.test(lines[0]) || p.picBullet) { sink().push({ type: 'item', ordered: false, depth: 0, key: 'typed', text: lines.join(' ').replace(TYPED_BULLET, '').trim() }); return; }
    sink().push({ type: 'para', lines: lines.map((l) => l.trim()).filter(Boolean) });
  };
  const tableBlocks = (t) => t.rows.flatMap((cells) => {
    const simple = cells.every((c) => c.length <= 1 && (!c[0] || (c[0].type === 'para' && c[0].lines.length === 1 && c[0].lines[0].length <= 80)));
    if (!simple) return cells.flat();
    const parts = cells.map((c) => c[0]?.lines[0]).filter(Boolean);
    return parts.length ? [{ type: 'para', lines: [parts.join(' · ')] }] : [];
  });
  for (const t of tokens(xml)) {
    if (t.tag && SKIP.has(t.tag)) {
      if (t.tag === 'w:delText' && !t.close) note.deleted = true;
      if (!t.empty) skip += t.close ? -1 : 1;
      continue;
    }
    if (skip) continue;
    const p = paras[paras.length - 1];
    if (!t.tag) { if (inText && p?.run) p.run.text += t.text; continue; }
    const { tag, close, empty, attrs } = t;
    if (tag === 'w:p') {
      if (empty) continue;
      if (close) { const done = paras.pop(); if (done) emit(done); } else paras.push({ runs: [], run: null, href: null });
      continue;
    }
    if (tag === 'w:tbl') { if (close) { const done = tables.pop(); sink().push(...tableBlocks(done)); } else if (!empty) tables.push({ rows: [] }); continue; }
    if (tag === 'w:tr' && !close && !empty) { tables[tables.length - 1]?.rows.push([]); continue; }
    if (tag === 'w:tc' && !close) { const t2 = tables[tables.length - 1]; t2?.rows[t2.rows.length - 1]?.push([]); continue; }
    if (!p) continue;
    if (tag === 'w:pPr') { if (!empty) inPPr += close ? -1 : 1; continue; }
    if (tag === 'w:rPr') { if (!empty) inRPr += close ? -1 : 1; continue; }
    if (close) {
      if (tag === 'w:t') inText = false;
      else if (tag === 'w:r') { if (p.run) p.runs.push(p.run); p.run = null; }
      else if (tag === 'w:hyperlink') p.href = null;
      continue;
    }
    if (inPPr && !inRPr) {
      if (tag === 'w:pStyle') p.style = attrs['w:val'];
      else if (tag === 'w:numId') p.numId = attrs['w:val'];
      else if (tag === 'w:ilvl') p.ilvl = Number(attrs['w:val']);
      else if (tag === 'w:outlineLvl') p.outline = Number(attrs['w:val']);
      continue;
    }
    if (inPPr) continue;
    if (tag === 'w:hyperlink') { const href = rels.get(attrs['r:id']); p.href = href && /^(https?:|mailto:)/i.test(href) ? href : null; continue; }
    if (tag === 'w:r') { p.run = { text: '', b: false, i: false, href: p.href }; if (empty) p.run = null; continue; }
    if (!p.run) continue;
    // A Word file converted from a PDF draws each bullet as a tiny picture ahead of the words.
    if (tag === 'wp:extent' && !p.runs.some((r) => r.text.trim()) && !p.run.text.trim() && Number(attrs.cx) < BULLET_EMU && Number(attrs.cy) < BULLET_EMU) { p.picBullet = true; note.picBullets = (note.picBullets || 0) + 1; continue; }
    if (inRPr) { if (tag === 'w:b') p.run.b = on(attrs); else if (tag === 'w:i') p.run.i = on(attrs); continue; }
    if (tag === 'w:t') { if (!empty) inText = true; continue; }
    if (tag === 'w:tab' || tag === 'w:ptab') p.run.text += '\t';
    else if (tag === 'w:br' || tag === 'w:cr') p.run.text += '\n';
    else if (tag === 'w:noBreakHyphen') p.run.text += '-';
  }
  return top;
}

/** Blocks to the house Markdown: headings, paragraphs whose lines keep their breaks, and lists. */
export function blocksToMarkdown(input) {
  // A file converted from a PDF breaks a sentence where the PDF's line ended. A paragraph opening in
  // lower case after a line that ends mid-sentence is that sentence's rest, and joins it.
  const blocks = [];
  for (const b of input) {
    const last = blocks[blocks.length - 1];
    const tail = last?.type === 'item' ? last.text : last?.type === 'para' ? last.lines[last.lines.length - 1] : '';
    if (b.type === 'para' && b.lines.length === 1 && /^[a-z]/.test(b.lines[0]) && /[a-z,]$/.test(tail || '')) {
      if (last.type === 'item') blocks[blocks.length - 1] = { ...last, text: `${last.text} ${b.lines[0]}` };
      else blocks[blocks.length - 1] = { ...last, lines: [...last.lines.slice(0, -1), `${tail} ${b.lines[0]}`] };
      continue;
    }
    blocks.push(b);
  }
  const out = [];
  const counters = new Map();
  let prev = null;
  for (const b of blocks) {
    if (b.type === 'item') {
      if (prev?.type !== 'item') counters.clear();
      let mark = '-';
      if (b.ordered) {
        const n = counters.has(b.key) ? counters.get(b.key) + 1 : (b.start || 1);
        counters.set(b.key, n);
        mark = `${n}.`;
      }
      out.push(`${prev?.type === 'item' ? '' : '\n'}${'  '.repeat(b.depth)}${mark} ${b.text}`);
    } else if (b.type === 'heading') out.push(`\n${'#'.repeat(Math.min(6, b.level + 1))} ${b.text}`);
    else out.push(`\n${b.lines.join('\n')}`);
    prev = b;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** A Word file's bytes to Markdown, with what was left out said in warnings. */
export async function docxToMarkdown(bytes) {
  const entries = zipEntries(bytes);
  const dec = new TextDecoder();
  const text = async (name) => { const b = await zipPart(bytes, entries, name); return b ? dec.decode(b) : ''; };
  const docXml = await text('word/document.xml');
  if (!docXml) throw new Error(`It opened, but it holds no Word document. ${SAVE_AS[0].toUpperCase()}${SAVE_AS.slice(1)}.`);
  const ctx = { styles: readStyles(await text('word/styles.xml')), list: readNumbering(await text('word/numbering.xml')) };
  const note = {};
  const blocks = [];
  // A header often carries the name and contact line; each distinct one is read once, ahead of the body.
  const seen = new Set();
  for (const name of [...entries.keys()].filter((n) => /^word\/header\d*\.xml$/.test(n)).sort()) {
    const rels = readRels(await text(name.replace(/^word\/(.*)$/, 'word/_rels/$1.rels')));
    const hb = partBlocks(await text(name), { ...ctx, rels }, note);
    const key = JSON.stringify(hb);
    if (hb.length && !seen.has(key)) { seen.add(key); blocks.push(...hb); }
  }
  blocks.push(...partBlocks(docXml, { ...ctx, rels: readRels(await text('word/_rels/document.xml.rels')) }, note));
  const markdown = blocksToMarkdown(blocks);
  if (!markdown) throw new Error('No words were found in it. If it is a scan or a picture of text, save it as PDF and add that instead.');
  const warnings = [];
  const pictures = [...entries.keys()].filter((n) => /^word\/media\//.test(n)).length;
  if (pictures && note.picBullets) warnings.push('Its small bullet pictures were read as bullets; any other picture in it was left out.');
  else if (pictures) warnings.push(`Its ${pictures === 1 ? 'picture was' : `${pictures} pictures were`} left out; only the words were read.`);
  if (note.deleted) warnings.push('Words marked as deleted in its tracked changes were left out.');
  return { markdown, warnings };
}

export function toBase64(bytes) {
  let s = '';
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(s);
}

/** A file's bytes, read: text and Word here, a PDF or picture packed for the read-file route. Throws
 *  an Error whose message says why it cannot be read and what to do instead. */
export async function readBytes(name, bytes) {
  const k = kindOf(name, bytes.length);
  if (k.refused) throw new Error(k.refused);
  if (k.kind === 'text') {
    const text = decodeText(bytes).replace(/\r\n?/g, '\n').trim();
    if (!text) throw new Error(`${name} is empty.`);
    return { name, kind: 'text', text, warnings: [] };
  }
  if (k.kind === 'word') {
    try { const r = await docxToMarkdown(bytes); return { name, kind: 'word', text: r.markdown, warnings: r.warnings }; }
    catch (e) { throw new Error(`${name}: ${e.message}`); }
  }
  return { name, kind: 'model', mediaType: k.mediaType, data: toBase64(bytes), size: bytes.length };
}
export const readFile = async (file) => readBytes(file.name, new Uint8Array(await file.arrayBuffer()));

// ── selftest and a by-hand read ───────────────────────────────────────────────────────────────────
async function deflateZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const comp = new Uint8Array(await new Response(new Blob([f.data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const head = (sig, size) => { const v = new DataView(new ArrayBuffer(size)); v.setUint32(0, sig, true); return v; };
    const lfh = head(0x04034b50, 30);
    [[4, 20, 2], [8, 8, 2], [14, crc32(f.data), 4], [18, comp.length, 4], [22, f.data.length, 4], [26, name.length, 2]].forEach(([a, v, n]) => (n === 4 ? lfh.setUint32(a, v, true) : lfh.setUint16(a, v, true)));
    const cen = head(0x02014b50, 46);
    [[4, 20, 2], [6, 20, 2], [10, 8, 2], [16, crc32(f.data), 4], [20, comp.length, 4], [24, f.data.length, 4], [28, name.length, 2], [42, offset, 4]].forEach(([a, v, n]) => (n === 4 ? cen.setUint32(a, v, true) : cen.setUint16(a, v, true)));
    parts.push(new Uint8Array(lfh.buffer), name, comp);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + comp.length;
  }
  const cdSize = central.reduce((s, a) => s + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
  let k = 0;
  for (const a of all) { out.set(a, k); k += a.length; }
  return out;
}
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const wordPack = (doc, { styles = '', numbering = '', rels = '', header = '' } = {}) => {
  const enc = new TextEncoder();
  const files = [['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W_NS}><w:body>${doc}</w:body></w:document>`]];
  if (styles) files.push(['word/styles.xml', `<w:styles ${W_NS}>${styles}</w:styles>`]);
  if (numbering) files.push(['word/numbering.xml', `<w:numbering ${W_NS}>${numbering}</w:numbering>`]);
  if (rels) files.push(['word/_rels/document.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`]);
  if (header) files.push(['word/header1.xml', `<w:hdr ${W_NS}>${header}</w:hdr>`]);
  return files.map(([name, t]) => ({ name, data: enc.encode(t) }));
};

async function selftest() {
  let fails = 0;
  const check = async (label, fn) => {
    try { await fn(); console.log(`  ok   ${label}`); } catch (e) { fails++; console.log(`  FAIL ${label}\n       ${e.message}`); }
  };
  const eq = (a, b) => { if (a !== b) throw new Error(`expected ${JSON.stringify(b)}\n       got      ${JSON.stringify(a)}`); };
  const refusedWith = async (p, re) => { try { await p; } catch (e) { if (re.test(e.message)) return; throw new Error(`refused with the wrong reason: ${e.message}`); } throw new Error('it was read, and should have been refused'); };
  console.log('file-import --selftest');

  // The control runs first: bytes that are not a zip must be refused, or every read below proves nothing.
  await check('a file that is not a zip is refused as a Word file, saying what to do', () => refusedWith(readBytes('notes.docx', new TextEncoder().encode('Just some words, not a Word file at all.')), /could not be opened as a Word file.*save it as PDF or Word/));

  const resume = [
    '# Ian Provencher',
    '',
    'Raleigh, NC | [LinkedIn](https://www.linkedin.com/in/example)',
    '',
    '## Experience',
    '',
    '**Supply Chain Planner**, Acme',
    '*March 2022 – Present*',
    '',
    '- Owned the MRP and BOM data for **four plants**',
    '  - Cut the planning cycle by a third',
    '- Rebuilt the nightly SQL extract',
    '',
    '## Selected Projects',
    '',
    '3. A third item, numbered as written',
    '4. And a fourth',
    '',
    '## Skills',
    '',
    'SAP, Python & Excel (advanced)',
  ].join('\n');
  const stored = mdToDocx(resume, { kind: 'resume' });
  await check('a Word file the writer made reads back as the Markdown it was made from', async () => eq((await docxToMarkdown(stored)).markdown, resume));
  await check('the same file with its parts deflated, as Word saves them, reads back the same', async () => {
    const entries = zipEntries(stored);
    const files = [];
    for (const name of entries.keys()) files.push({ name, data: await zipPart(stored, entries, name) });
    const deflated = await deflateZip(files);
    eq([...zipEntries(deflated).values()].every((e) => e.method === 8), true);
    eq((await docxToMarkdown(deflated)).markdown, resume);
  });

  // Word's own XML: attributes on every tag, styles by name, numbering by list, text boxes in two copies.
  const styles = '<w:style w:type="paragraph" w:styleId="berschrift1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="MyTitle"><w:name w:val="Title"/></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Bulleted"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/></w:style>';
  const numbering = '<w:abstractNum w:abstractNumId="7"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>'
    + '<w:abstractNum w:abstractNumId="8"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>'
    + '<w:num w:numId="3"><w:abstractNumId w:val="7"/></w:num><w:num w:numId="4"><w:abstractNumId w:val="8"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="2"/></w:lvlOverride></w:num>';
  const P = (inner, ppr = '') => `<w:p w:rsidR="00A1B2C3" w:rsidRDefault="00D4E5F6">${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${inner}</w:p>`;
  const R = (t, rpr = '') => `<w:r w:rsidRPr="00112233">${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
  const doc = [
    P(R('Ian Provencher'), '<w:pStyle w:val="MyTitle"/>'),
    P(`${R('ian@example.com')}<w:r><w:tab/></w:r>${R('Raleigh, NC')}`),
    P(R('Experience'), '<w:pStyle w:val="berschrift1"/><w:rPr><w:b/></w:rPr>'),
    P(`${R('Planner ', '<w:b w:val="1"/><w:bCs/>')}${R('at Acme', '<w:b w:val="0"/>')}<w:r><w:br/></w:r>${R('2022 &#8211; 2024', '<w:i/>')}`),
    P(R('Cut excess &amp; obsolete stock'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>'),
    P(R('Across &lt;four&gt; plants'), '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="3"/></w:numPr>'),
    P(R('Second step'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="4"/></w:numPr>'),
    P(R('Third step'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="4"/></w:numPr>'),
    P(R('A styled bullet'), '<w:pStyle w:val="Bulleted"/>'),
    P(R('•\tA bullet typed by hand')),
    P(`<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${R('Shown')}<w:r><w:fldChar w:fldCharType="end"/></w:r>${R(' text')}<w:del w:id="1"><w:r><w:delText>gone</w:delText></w:r></w:del>`),
    P(`<w:hyperlink r:id="rId9" w:history="1">${R('Portfolio', '<w:rStyle w:val="Hyperlink"/>')}</w:hyperlink>`),
    P(`<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><w:txbxContent>${P(R('In a text box'))}</w:txbxContent></w:drawing></mc:Choice><mc:Fallback><w:pict><w:txbxContent>${P(R('In a text box'))}</w:txbxContent></w:pict></mc:Fallback></mc:AlternateContent></w:r>`),
    `<w:tbl><w:tblPr/><w:tr w:rsidR="1"><w:tc><w:tcPr/>${P(R('SAP'))}</w:tc><w:tc>${P(R('Python'))}</w:tc></w:tr>`
      + `<w:tr><w:tc>${P(R('Left column'))}${P(R('Its second line'))}</w:tc><w:tc>${P(R('Right column'))}</w:tc></w:tr></w:tbl>`,
    '<w:p/>',
    '<w:sectPr><w:pgSz w:w="12240"/></w:sectPr>',
  ].join('');
  const rels = '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/work" TargetMode="External"/>';
  const want = [
    '# Ian Provencher',
    '',
    'ian@example.com · Raleigh, NC',
    '',
    '## Experience',
    '',
    '**Planner** at Acme',
    '*2022 – 2024*',
    '',
    '- Cut excess & obsolete stock',
    '  - Across <four> plants',
    '2. Second step',
    '3. Third step',
    '- A styled bullet',
    '- A bullet typed by hand',
    '',
    'Shown text',
    '',
    '[Portfolio](https://example.com/work)',
    '',
    'In a text box',
    '',
    'SAP · Python',
    '',
    'Left column',
    '',
    'Its second line',
    '',
    'Right column',
  ].join('\n');
  const wordStyle = await deflateZip(wordPack(doc, { styles, numbering, rels }));
  await check("Word's own XML reads as Markdown: styles by name, lists by numbering, breaks, tabs, links, text boxes once, tables", async () => {
    const r = await docxToMarkdown(wordStyle);
    eq(r.markdown, want);
    eq(r.warnings.join(' | '), 'Words marked as deleted in its tracked changes were left out.');
  });
  // His 2021 résumé, a PDF converted to Word: tiny pictures for bullets, and a paragraph at every line end.
  const pic = (emu) => `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${emu}" cy="${emu}"/></wp:inline></w:drawing></w:r>`;
  await check('a tiny picture ahead of the words is a bullet, and a line broken by the PDF joins its sentence', async () => {
    const r = await docxToMarkdown(storeZip(wordPack([P(`${pic(65978)}${R(' Delivered presentations to build the client')}`), P(R('base, and kept it.')), P(`${pic(65978)}${R('Explained procedures')}`)].join(''))));
    eq(r.markdown, '- Delivered presentations to build the client base, and kept it.\n- Explained procedures');
  });
  await check('a full-size picture leaves its paragraph a paragraph, and a finished or capitalised line stays apart (the controls)', async () => {
    const r = await docxToMarkdown(storeZip(wordPack([P(`${pic(914400)}${R('A logo, then words')}`), P(R('Ends here.')), P(R('lower case after a full stop')), P(R('Ends without a stop')), P(R('Capitalised next'))].join(''))));
    eq(r.markdown, 'A logo, then words\n\nEnds here.\n\nlower case after a full stop\n\nEnds without a stop\n\nCapitalised next');
  });
  await check('a header holding the name is read once, ahead of the body', async () => {
    const r = await docxToMarkdown(storeZip(wordPack(P(R('Body text.')), { header: P(R('Ian Provencher')) })));
    eq(r.markdown, 'Ian Provencher\n\nBody text.');
  });
  await check('a Word file with no words says to send a PDF instead', () => refusedWith(docxToMarkdown(storeZip(wordPack('<w:p/>'))), /No words were found/));
  await check('a zip with no Word document in it is refused', () => refusedWith(docxToMarkdown(storeZip([{ name: 'other.txt', data: new TextEncoder().encode('hi') }])), /holds no Word document/));

  await check('old formats are refused with the way round, and a PDF or picture goes to the model', async () => {
    for (const n of ['old.doc', 'notes.rtf', 'cv.odt', 'cv.pages']) eq(/older format.*save it as PDF or Word/.test(kindOf(n).refused || ''), true);
    eq(/not a file this page can read/.test(kindOf('sheet.xlsx').refused || ''), true);
    eq(kindOf('cv.pdf').mediaType, 'application/pdf');
    eq(kindOf('shot.PNG').mediaType, 'image/png');
    eq(kindOf('cv.docx').kind, 'word');
    eq(kindOf('notes.md').kind, 'text');
  });
  await check('a file over the size limit is refused before it is read, and one at the limit is not', () => {
    eq(/is 10\.0 MB, and a file can be at most 10\.0 MB/.test(kindOf('big.pdf', MAX_FILE_BYTES + 1).refused || ''), true);
    eq(kindOf('big.pdf', MAX_FILE_BYTES).kind, 'model');
    eq(/a picture can be at most 7\.0 MB/.test(kindOf('shot.png', MAX_IMAGE_BYTES + 1).refused || ''), true);
    eq(kindOf('shot.png', MAX_IMAGE_BYTES).kind, 'model');
    // The largest picture the page lets through stays inside what the Worker accepts once encoded.
    eq(Math.ceil(MAX_IMAGE_BYTES / 3) * 4 <= 10_000_000, true);
  });
  await check('text is read as UTF-8, and a Windows file in its own code page is not garbled', async () => {
    eq((await readBytes('a.txt', new TextEncoder().encode('﻿Café résumé\r\nline two'))).text, 'Café résumé\nline two');
    eq((await readBytes('b.txt', Uint8Array.from([0x43, 0x61, 0x66, 0xE9]))).text, 'Café');
  });
  await check('a PDF is packed for the model with its type, and its bytes survive the packing', async () => {
    const bytes = Uint8Array.from({ length: 70_000 }, (_, k) => (k * 31) % 256);
    const r = await readBytes('cv.pdf', bytes);
    eq(r.kind, 'model');
    eq(r.mediaType, 'application/pdf');
    eq(Buffer.from(r.data, 'base64').equals(Buffer.from(bytes)), true);
  });
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
}

async function readByHand(path) {
  const fs = process.getBuiltinModule('node:fs');
  const name = path.split(/[\\/]/).pop();
  try {
    const r = await readBytes(name, new Uint8Array(fs.readFileSync(path)));
    if (r.kind === 'model') { console.log(`${name}: a ${r.mediaType} file of ${mb(r.size)}; the console sends it to the model to read.`); return 0; }
    console.log(`${name}: read as ${r.kind}, ${r.text.length} characters, ${r.text.split('\n').length} lines.`);
    for (const w of r.warnings) console.log(`  note: ${w}`);
    console.log(`---\n${r.text}`);
    return 0;
  } catch (e) { console.log(`refused: ${e.message}`); return 1; }
}

// Guarded so the browser bundle (no `process`) never evaluates it, and only when this file is the one run.
if (typeof process !== 'undefined' && /file-import\.js$/.test(process.argv?.[1] || '') && process.argv.includes('--selftest')) selftest();
else if (typeof process !== 'undefined' && /file-import\.js$/.test(process.argv?.[1] || '') && process.argv.includes('--file')) readByHand(process.argv[process.argv.indexOf('--file') + 1] || '').then((c) => process.exit(c));
