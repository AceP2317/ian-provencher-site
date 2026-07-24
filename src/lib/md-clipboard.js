/* ============================================================================
   md-clipboard — put a generated résumé / cover letter on the clipboard in BOTH
   flavours at once, so one button serves the two places it actually gets pasted.

     • text/html  → Google Docs, Word, Gmail take this and render real headings,
                    bold, and bullets. No "Paste from Markdown", no preference
                    toggle, no right-click.
     • text/plain → ATS "paste your resume here" boxes take this and get clean
                    prose with the Markdown syntax stripped out. Formatting is
                    discarded by those parsers anyway; the leftover `##` and `**`
                    were pure noise.

   The clipboard holds both simultaneously and each destination picks the one it
   understands, so the operator never has to choose up front.

   ponytail: a deliberately small Markdown subset — headings, bold, italic,
   bullets, numbered lists, links, horizontal rules, paragraphs. That is the
   whole grammar RESUME_PROMPT is allowed to emit ("no tables, no multi-column
   layout, no images, no emoji"), and worker/resume-lint.mjs flags a table if one
   ever appears. Reach for a real Markdown library only if that contract changes.

   PUBLIC: src/ ships to the public mirror. Keep this generic — no prompts, no
   phrase lists, and never import from worker/ (that would drag private content
   into the public build).

   React-free and side-effect-free at module scope, matching search-core.js.
   ============================================================================ */

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const RULE_RE = /^(-{3,}|\*{3,}|_{3,})$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^[-*+]\s+(.*)$/;
const NUMBERED_RE = /^\d+[.)]\s+(.*)$/;

/* Inline spans. Order matters: escape first (so a stray < can't inject markup),
   then links, then BOLD BEFORE ITALIC — `**x**` must be consumed before the
   single-asterisk rule sees it, or it renders as an italic wrapping an
   asterisk. The leading (^|[\s(]) on the italic rules keeps mid-word
   underscores in identifiers from becoming emphasis. */
function inlineHtml(s) {
  return escapeHtml(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
}

/** Markdown → HTML, for the rich-text clipboard flavour. */
export function mdToHtml(md) {
  const lines = String(md ?? '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let para = [];
  let listTag = null;

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inlineHtml(para.join(' '))}</p>`); para = []; }
  };
  const closeList = () => {
    if (listTag) { out.push(`</${listTag}>`); listTag = null; }
  };
  const openList = (tag) => {
    if (listTag !== tag) { closeList(); out.push(`<${tag}>`); listTag = tag; }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); closeList(); continue; }

    const heading = line.match(HEADING_RE);
    if (heading) {
      flushPara(); closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineHtml(heading[2])}</h${level}>`);
      continue;
    }

    // Checked before the bullet rule: `---` would otherwise read as a bullet.
    if (RULE_RE.test(line)) { flushPara(); closeList(); out.push('<hr>'); continue; }

    const bullet = line.match(BULLET_RE);
    if (bullet) { flushPara(); openList('ul'); out.push(`<li>${inlineHtml(bullet[1])}</li>`); continue; }

    const numbered = line.match(NUMBERED_RE);
    if (numbered) { flushPara(); openList('ol'); out.push(`<li>${inlineHtml(numbered[1])}</li>`); continue; }

    closeList();
    para.push(line);
  }

  flushPara();
  closeList();
  return out.join('\n');
}

/* Markdown → plain text, for the ATS flavour. Strips the SYNTAX and keeps the
   words. Bullets keep their ASCII "- " on purpose: swapping in "•" looks tidier
   but ships a non-ASCII character into parsers with a long history of mangling
   them, and the hyphen already reads as a list. */
export function mdToPlain(md) {
  return String(md ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((raw) => {
      const line = raw.trim();
      if (RULE_RE.test(line)) return '';
      return line
        .replace(HEADING_RE, '$2')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1$2')
        .replace(/(^|[\s(])_([^_\n]+)_/g, '$1$2');
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Write both flavours to the clipboard in one item.
 * @returns {Promise<'formatted'|'plain'>} which flavour actually landed.
 */
export async function copyFormatted(markdown) {
  const plain = mdToPlain(markdown);
  // Blobs are built synchronously so the write stays inside the user gesture —
  // Safari rejects a ClipboardItem assembled after an await.
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([mdToHtml(markdown)], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })]);
      return 'formatted';
    } catch { /* fall through — permissions or an unsupported flavour */ }
  }
  await navigator.clipboard.writeText(plain);
  return 'plain';
}

/* ── selftest ────────────────────────────────────────────────────────────────
   `npm run lint:clipboard` — pure string transforms, no DOM, no network.
   copyFormatted() is not covered here (it needs a real clipboard); it is a thin
   wrapper over the two functions that ARE covered. Inert in the browser. */
function selftest() {
  let fails = 0;
  const check = (label, fn) => {
    try { fn(); console.log(`  ok   ${label}`); } catch (e) { fails++; console.log(`  FAIL ${label} — ${e.message}`); }
  };
  const eq = (a, b) => { if (a !== b) throw new Error(`got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
  const has = (a, b) => { if (!a.includes(b)) throw new Error(`${JSON.stringify(a)} lacks ${JSON.stringify(b)}`); };
  const lacks = (a, b) => { if (a.includes(b)) throw new Error(`${JSON.stringify(a)} still contains ${JSON.stringify(b)}`); };

  console.log('md-clipboard --selftest');

  // Headings and inline spans — what carries a résumé's structure.
  check('heading level preserved', () => eq(mdToHtml('## Experience'), '<h2>Experience</h2>'));
  check('h6 is the deepest level', () => eq(mdToHtml('###### Deep'), '<h6>Deep</h6>'));
  check('bold becomes <strong>', () => has(mdToHtml('**Planner**, Acme'), '<strong>Planner</strong>'));
  check('italic becomes <em>', () => has(mdToHtml('a *word* here'), '<em>word</em>'));
  // The ordering trap: italic-before-bold turns **x** into <em>*x</em>*.
  check('bold is not mangled by the italic rule', () => lacks(mdToHtml('**Planner**'), '<em>'));
  check('link becomes an anchor', () =>
    has(mdToHtml('[site](https://ian-provencher.com)'), '<a href="https://ian-provencher.com">site</a>'));

  // Lists.
  check('bullets become a ul', () => eq(mdToHtml('- One\n- Two'), '<ul>\n<li>One</li>\n<li>Two</li>\n</ul>'));
  check('numbered items become an ol', () => has(mdToHtml('1. One\n2. Two'), '<ol>'));
  check('a list is closed before a following heading', () => has(mdToHtml('- One\n\n## Next'), '</ul>'));
  check('switching list type closes the previous list', () => has(mdToHtml('- One\n1. Two'), '</ul>\n<ol>'));

  // Paragraphs and rules.
  check('wrapped lines join into one paragraph', () => eq(mdToHtml('one\ntwo'), '<p>one two</p>'));
  check('a blank line splits paragraphs', () => eq(mdToHtml('one\n\ntwo'), '<p>one</p>\n<p>two</p>'));
  check('--- becomes an hr, not a bullet', () => eq(mdToHtml('---'), '<hr>'));
  check('empty input yields empty output', () => eq(mdToHtml(''), ''));

  // Escaping — the résumé is operator data, but a stray < must not become markup.
  check('angle brackets are escaped', () => has(mdToHtml('a < b'), '&lt;'));
  check('ampersand is escaped', () => has(mdToHtml('R&D'), 'R&amp;D'));

  // Plain flavour — syntax out, words kept.
  check('plain strips heading marks', () => eq(mdToPlain('## Experience'), 'Experience'));
  check('plain strips bold marks', () => eq(mdToPlain('**Planner**, Acme'), 'Planner, Acme'));
  check('plain KEEPS ascii bullets', () => eq(mdToPlain('- Cut lead time 30%'), '- Cut lead time 30%'));
  check('plain keeps link text and url', () =>
    eq(mdToPlain('[site](https://x.com)'), 'site (https://x.com)'));
  check('plain drops horizontal rules', () => eq(mdToPlain('a\n\n---\n\nb'), 'a\n\nb'));
  check('plain leaves no markdown syntax behind', () => {
    const out = mdToPlain('## Head\n\n**Bold** and *italic*\n\n- bullet');
    lacks(out, '#'); lacks(out, '**'); lacks(out, '*italic*');
  });
  check('plain collapses runs of blank lines', () => eq(mdToPlain('a\n\n\n\nb'), 'a\n\nb'));

  // A realistic résumé fragment, end to end.
  const resume = '## Experience\n\n**Supply Chain Planner**, Acme — New Bern, NC\n\n- Cut lead time 30%\n- Owned MRP/BOM data\n\n## Education\n\nB.S. Logistics';
  check('résumé fragment renders every block type', () => {
    const html = mdToHtml(resume);
    has(html, '<h2>Experience</h2>'); has(html, '<strong>Supply Chain Planner</strong>');
    has(html, '<ul>'); has(html, '<li>Cut lead time 30%</li>'); has(html, '<h2>Education</h2>');
  });
  check('résumé fragment survives the plain pass intact', () => {
    const out = mdToPlain(resume);
    has(out, 'Experience'); has(out, 'Supply Chain Planner, Acme — New Bern, NC');
    has(out, '- Cut lead time 30%'); lacks(out, '**'); lacks(out, '##');
  });

  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
}

// Guarded so the browser bundle (no `process`) never evaluates it.
if (typeof process !== 'undefined' && process.argv?.includes('--selftest')) selftest();
