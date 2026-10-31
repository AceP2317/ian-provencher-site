/* ============================================================================
   draft-export — a generated résumé or letter as a Word file, a print page and
   plain text, read by the one Markdown grammar md-clipboard.js exports.

   THE WORD FILE IS BUILT FOR PARSERS FIRST: one column, no tables, no text
   boxes, nothing in a header or footer, Word's own heading and title styles,
   real list numbering so a bullet is never a typed character, Letter paper.
   Greenhouse names tables, columns, headers and text boxes as what breaks a
   parse (support.greenhouse.io 200989175).

   It REFUSES rather than drops: a table, a code block, an image or a raw tag in
   the draft is named with its line, and no file is made. Its text equals
   mdToPlain's line for line, which scripts/check-resume-docx.mjs holds.

   ponytail: a stored zip (no compression) and a hand-built document. That is
   about 6 KB for a page, and Word, Docs and every parser read it. Reach for a
   library only if a draft ever needs a table or an image, which the prompts ban.

   PUBLIC: src/ ships to the public mirror. Keep this generic.
   ============================================================================ */
import {
  RULE_RE, HEADING_RE, BULLET_RE, NUMBERED_RE, CODE_RE, LINK_RE, BOLD_RE, ITALIC_STAR_RE, ITALIC_UNDER_RE,
  SAFE_HREF, linkWords, indentOf, mdToHtml, mdToPlain,
} from './md-clipboard.js';

/** Each line the exports cannot render faithfully: [{ line, why }]. Empty means it can be exported. */
export function exportProblems(md) {
  const out = [];
  const lines = String(md ?? '').replace(/\r\n/g, '\n').split('\n');
  if (!lines.some((l) => l.trim())) return [{ line: 0, why: 'the draft is empty' }];
  lines.forEach((raw, i) => {
    const l = raw.trim();
    const at = (why) => out.push({ line: i + 1, why });
    if (/^(```|~~~)/.test(l)) at('a code block');
    else if (/^\|.*\|$/.test(l) || /^\|?\s*:?-{3,}:?\s*\|/.test(l)) at('a table');
    else if (/!\[[^\]]*\]\([^)]*\)/.test(l)) at('an image');
    else if (/<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>/i.test(l)) at('a raw tag');
  });
  return out;
}
const refusal = (problems) => `It cannot be exported as written: ${problems.map((p) => (p.line ? `line ${p.line} is ${p.why}` : p.why)).join('; ')}. Take it out and try again.`;

/** The draft as blocks: heading, item (bullet or numbered), para (its lines), rule. */
export function mdBlocks(md) {
  const blocks = [];
  let para = null;
  const flush = () => { if (para) { blocks.push(para); para = null; } };
  for (const raw of String(md ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const h = line.match(HEADING_RE);
    if (h) { flush(); blocks.push({ type: 'heading', level: h[1].length, text: h[2] }); continue; }
    if (RULE_RE.test(line)) { flush(); blocks.push({ type: 'rule' }); continue; }
    const b = line.match(BULLET_RE);
    const n = b ? null : line.match(NUMBERED_RE);
    if (b || n) {
      flush();
      // As md-clipboard nests: one level at most, and never under nothing.
      const prev = blocks[blocks.length - 1];
      const depth = indentOf(raw) >= 2 && prev?.type === 'item' ? 2 : 1;
      blocks.push({ type: 'item', ordered: !!n, depth, text: (b || n)[1] });
      continue;
    }
    if (!para) para = { type: 'para', lines: [] };
    para.lines.push(line);
  }
  flush();
  return blocks;
}

/* Inline runs, by the same replacements in the same order as mdToPlain, so the words cannot differ.
   Each marked span is swapped for private-use markers, then the markers are walked into runs. */
const MARK = { link: '', b0: '', b1: '', i0: '', i1: '' };
export function runsOf(s) {
  const links = [];
  const t = String(s).replace(/[-]/g, '')
    .replace(CODE_RE, '$1')
    .replace(LINK_RE, (_, label, href) => { links.push({ label, href }); return `${MARK.link}${links.length - 1}${MARK.link}`; })
    .replace(BOLD_RE, `${MARK.b0}$1${MARK.b1}`)
    .replace(ITALIC_STAR_RE, `$1${MARK.i0}$2${MARK.i1}`)
    .replace(ITALIC_UNDER_RE, `$1${MARK.i0}$2${MARK.i1}`);
  const runs = [];
  let b = 0, i = 0, buf = '';
  const push = (text, extra = {}) => { if (text) runs.push({ text, b: b > 0, i: i > 0, ...extra }); };
  for (let k = 0; k < t.length; k++) {
    const c = t[k];
    if (c === MARK.link) {
      const end = t.indexOf(MARK.link, k + 1);
      const { label, href } = links[Number(t.slice(k + 1, end))];
      push(buf); buf = '';
      push(label, SAFE_HREF.test(href) ? { href } : {});
      push(linkWords(label, href).slice(label.length));
      k = end;
    } else if (c === MARK.b0 || c === MARK.b1 || c === MARK.i0 || c === MARK.i1) {
      push(buf); buf = '';
      if (c === MARK.b0) b++; else if (c === MARK.b1) b--; else if (c === MARK.i0) i++; else i--;
    } else buf += c;
  }
  push(buf);
  return runs;
}

// ── Word ──────────────────────────────────────────────────────────────────────────────────────────
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
// XML 1.0 refuses these characters outright, and Word then refuses the whole file.
const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const xml = (s) => String(s).replace(XML_BAD, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Sizes in half-points, spacing in twentieths of a point, margins in twentieths of a point (1 in = 1440).
const LOOK = {
  resume: { size: 21, after: 40, before: 60, margin: 864 },
  letter: { size: 22, after: 200, before: 0, margin: 1440 },
};

function stylesXml(look) {
  const p = (id, name, ppr, rpr, extra = '') => `<w:style w:type="paragraph"${extra} w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr>${ppr}</w:pPr>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}</w:style>`;
  return `${XML_HEAD}<w:styles xmlns:w="${W}">`
    + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="${look.size}"/><w:szCs w:val="${look.size}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>`
    + `<w:pPrDefault><w:pPr><w:spacing w:after="${look.after}" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    // A résumé paragraph gets a little air above it, so a role line after a run of bullets stands apart.
    + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="${look.before}"/></w:pPr></w:style>`
    + p('Title', 'Title', '<w:spacing w:before="0" w:after="20"/><w:jc w:val="center"/>', '<w:b/><w:sz w:val="36"/><w:szCs w:val="36"/>')
    + p('Contact', 'Contact', '<w:spacing w:before="0" w:after="120"/><w:jc w:val="center"/>', '', ' w:customStyle="1"')
    + p('Heading1', 'heading 1', '<w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="auto"/></w:pBdr><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="0"/>', `<w:b/><w:caps/><w:sz w:val="${look.size + 2}"/><w:szCs w:val="${look.size + 2}"/>`)
    + p('Heading2', 'heading 2', '<w:keepNext/><w:spacing w:before="100" w:after="20"/><w:outlineLvl w:val="1"/>', '<w:b/>')
    + p('Heading3', 'heading 3', '<w:keepNext/><w:spacing w:before="80" w:after="20"/><w:outlineLvl w:val="2"/>', '<w:b/><w:i/>')
    + p('ListParagraph', 'List Paragraph', '<w:spacing w:before="0" w:after="20"/>', '')
    + p('Rule', 'Rule', '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="auto"/></w:pBdr><w:spacing w:before="0" w:after="60"/>', '', ' w:customStyle="1"')
    + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:u w:val="single"/></w:rPr></w:style>'
    + '</w:styles>';
}

function numberingXml(numbered) {
  const lvl = (ilvl, fmt, text, left) => `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="216"/></w:pPr></w:lvl>`;
  const nums = ['<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'];
  for (let k = 0; k < numbered; k++) nums.push(`<w:num w:numId="${k + 2}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`);
  return `${XML_HEAD}<w:numbering xmlns:w="${W}">`
    + `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, 'bullet', '•', 360)}${lvl(1, 'bullet', '–', 720)}</w:abstractNum>`
    + `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, 'decimal', '%1.', 360)}${lvl(1, 'lowerLetter', '%2.', 720)}</w:abstractNum>`
    + `${nums.join('')}</w:numbering>`;
}

/** The draft as a .docx file's bytes. Throws, naming each line, when it cannot be exported faithfully. */
export function mdToDocx(md, { kind = 'resume', title = '', author = '' } = {}) {
  const problems = exportProblems(md);
  if (problems.length) throw new Error(refusal(problems));
  const look = LOOK[kind === 'resume' ? 'resume' : 'letter'];
  const links = [];
  const relFor = (href) => { let k = links.indexOf(href); if (k < 0) { links.push(href); k = links.length - 1; } return `rIdL${k + 1}`; };
  const runXml = (r) => {
    const props = `${r.href ? '<w:rStyle w:val="Hyperlink"/>' : ''}${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}`;
    const x = `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(r.text)}</w:t></w:r>`;
    return r.href ? `<w:hyperlink r:id="${relFor(r.href)}" w:history="1">${x}</w:hyperlink>` : x;
  };
  const p = (style, inner, num) => `<w:p>${style || num ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${num ? `<w:numPr><w:ilvl w:val="${num.ilvl}"/><w:numId w:val="${num.id}"/></w:numPr>` : ''}</w:pPr>` : ''}${inner}</w:p>`;

  const body = [];
  let titled = false, header = false, numbered = 0, prev = null;
  // The list in progress at each depth. As in md-clipboard, a blank line does not end a list, a change
  // of list type does, and a numbered list starts again at 1.
  let top = null, sub = null;
  const listAt = (cur, ordered) => (cur && cur.ordered === ordered ? cur : { ordered, id: ordered ? 2 + numbered++ : 1 });
  for (const blk of mdBlocks(md)) {
    if (blk.type === 'heading') {
      // The first top heading is the name; the lines under it, up to the next heading, are the contact block.
      const first = blk.level === 1 && !titled;
      titled ||= first;
      header = first;
      body.push(p(first ? 'Title' : `Heading${Math.min(3, Math.max(1, blk.level - 1))}`, runsOf(blk.text).map(runXml).join('')));
    } else if (blk.type === 'rule') {
      header = false;
      body.push(p('Rule', ''));
    } else if (blk.type === 'item') {
      header = false;
      if (prev?.type !== 'item') { top = null; sub = null; }
      let list;
      if (blk.depth === 1) { sub = null; list = top = listAt(top, blk.ordered); } else list = sub = listAt(sub, blk.ordered);
      body.push(p('ListParagraph', runsOf(blk.text).map(runXml).join(''), { ilvl: blk.depth - 1, id: list.id }));
    } else {
      body.push(p(header ? 'Contact' : '', blk.lines.map((l) => runsOf(l).map(runXml).join('')).join('<w:r><w:br/></w:r>')));
    }
    prev = blk;
  }
  const m = look.margin;
  const documentXml = `${XML_HEAD}<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body.join('')}`
    + `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="${m}" w:right="${m}" w:bottom="${m}" w:left="${m}" w:header="432" w:footer="432" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const rel = (id, type, target, ext) => `<Relationship Id="${id}" Type="${type}" Target="${xml(target)}"${ext ? ' TargetMode="External"' : ''}/>`;
  const docRels = `${XML_HEAD}<Relationships xmlns="${PKG}">`
    + rel('rId1', `${R}/styles`, 'styles.xml') + rel('rId2', `${R}/numbering`, 'numbering.xml') + rel('rId3', `${R}/settings`, 'settings.xml')
    + links.map((h, k) => rel(`rIdL${k + 1}`, `${R}/hyperlink`, h, true)).join('') + '</Relationships>';
  const CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml';
  const files = [
    ['[Content_Types].xml', `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + `<Override PartName="/word/document.xml" ContentType="${CT}.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${CT}.styles+xml"/>`
      + `<Override PartName="/word/numbering.xml" ContentType="${CT}.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="${CT}.settings+xml"/>`
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
    ['_rels/.rels', `${XML_HEAD}<Relationships xmlns="${PKG}">${rel('rId1', `${R}/officeDocument`, 'word/document.xml')}${rel('rId2', `${PKG}/metadata/core-properties`, 'docProps/core.xml')}</Relationships>`],
    ['docProps/core.xml', `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">${title ? `<dc:title>${xml(title)}</dc:title>` : ''}${author ? `<dc:creator>${xml(author)}</dc:creator>` : ''}</cp:coreProperties>`],
    ['word/document.xml', documentXml],
    ['word/styles.xml', stylesXml(look)],
    ['word/numbering.xml', numberingXml(numbered)],
    // Without this, Word opens the file in compatibility mode and says so in its title bar.
    ['word/settings.xml', `${XML_HEAD}<w:settings xmlns:w="${W}"><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`],
    ['word/_rels/document.xml.rels', docRels],
  ];
  const enc = new TextEncoder();
  return storeZip(files.map(([name, text]) => ({ name, data: enc.encode(text) })));
}

// ── the zip a .docx is: stored entries, each with its CRC-32 ──────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let k = 0; k < bytes.length; k++) c = CRC_TABLE[(c ^ bytes[k]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
export function storeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const DOS_DATE = 0x21; // 1980-01-01, so the same draft always makes the same bytes
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0, 2], [8, 0, 2], [10, 0, 2], [12, DOS_DATE, 2], [14, crc, 4], [18, f.data.length, 4], [22, f.data.length, 4], [26, name.length, 2], [28, 0, 2]]
      .forEach(([at, v, n]) => (n === 4 ? local.setUint32(at, v, true) : local.setUint16(at, v, true)));
    const cen = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0, 2], [10, 0, 2], [12, 0, 2], [14, DOS_DATE, 2], [16, crc, 4], [20, f.data.length, 4], [24, f.data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([at, v, n]) => (n === 4 ? cen.setUint32(at, v, true) : cen.setUint16(at, v, true)));
    parts.push(new Uint8Array(local.buffer), name, f.data);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((s, a) => s + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, cdSize, 4], [16, offset, 4], [20, 0, 2]]
    .forEach(([at, v, n]) => (n === 4 ? end.setUint32(at, v, true) : end.setUint16(at, v, true)));
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
  let k = 0;
  for (const a of all) { out.set(a, k); k += a.length; }
  return out;
}

// ── the posting's terms in the draft ──────────────────────────────────────────────────────────────
const words = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9+#]+/g, ' ').trim();
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Which of the posting's terms the draft carries, as whole words (a plural or -ing still counts). A term
 *  written "long form (SHORT)" or "a / b" counts when either form is there. */
export function keywordCoverage(keywords, md) {
  const text = ` ${words(mdToPlain(md))} `;
  const found = [], missing = [];
  for (const k of keywords || []) {
    const forms = [k, ...String(k).split(/\s*[()/]\s*/)].map(words).filter((f) => f.length > 1);
    (forms.some((f) => new RegExp(` ${escRe(f)}(?:s|es|ing|ed|d)? `).test(text)) ? found : missing).push(k);
  }
  return { found, missing };
}

// ── print ─────────────────────────────────────────────────────────────────────────────────────────
/** A whole page for the browser's print dialog (Save as PDF), drawn from mdToHtml. Throws as mdToDocx does. */
export function printHtml(md, { kind = 'resume', title = '' } = {}) {
  const problems = exportProblems(md);
  if (problems.length) throw new Error(refusal(problems));
  return printPage(mdToHtml(md), { kind, title });
}
// The printed page around body HTML that is already safe: a draft's rendered markdown, or a handbook
// section the Worker built. `css` adds rules a page needs that a draft never has, such as tables.
export function printPage(body, { kind = 'resume', title = '', css = '' } = {}) {
  const resume = kind === 'resume';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${xml(title)}</title><style>
@page { size: letter; margin: ${resume ? '0.6in' : '1in'}; }
body { margin: 0; font-family: Calibri, Carlito, Arial, sans-serif; font-size: ${resume ? '10.5pt' : '11pt'}; line-height: 1.26; }
h1 { font-size: 18pt; text-align: center; margin: 0 0 1pt; }
h1 + p { text-align: center; margin-bottom: 6pt; }
h2 { font-size: ${resume ? '11.5pt' : '12pt'}; text-transform: uppercase; border-bottom: 0.5pt solid; padding-bottom: 1pt; margin: 8pt 0 3pt; break-after: avoid; }
h3, h4, h5, h6 { font-size: 1em; margin: 5pt 0 1pt; break-after: avoid; }
p { margin: 0 0 ${resume ? '2pt' : '10pt'}; }
ul, ol { margin: 0 0 2pt; padding-left: 16pt; }
li { margin: 0 0 1pt; }
a { color: inherit; }
hr { border: 0; border-top: 0.5pt solid; margin: 4pt 0; }
${css}</style></head><body>${body}</body></html>`;
}
