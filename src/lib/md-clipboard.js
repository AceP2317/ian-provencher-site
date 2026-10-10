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

   THE INVARIANT THAT MATTERS, and the one a change here is most likely to break:
   BOTH FLAVOURS DESCRIBE THE SAME DOCUMENT. They may differ in markup, never in
   line structure. This was violated in the shipped version and is now pinned by
   a selftest that compares line counts. Markdown's rule that a lone newline
   inside a paragraph is a SPACE exists for prose hand-wrapped at 80 columns; it
   is wrong for a generated résumé, where the model emits a newline only when it
   means one. Measured: a role's title line and date line — the exact shape
   RESUME_PROMPT asks for — merged into one run-on paragraph in the HTML flavour
   while the plain flavour kept them apart, so the date landed on the title's
   line in Google Docs. Paragraph lines therefore join with <br>, not " ".

   ponytail: a deliberately small Markdown subset — headings, bold, italic,
   bullets (ONE level of nesting), numbered lists, links, horizontal rules,
   paragraphs, and code spans (stripped to their contents). That is the whole
   grammar RESUME_PROMPT is allowed to emit ("no tables, no multi-column layout,
   no images, no emoji"), and worker/resume-lint.mjs flags a table if one ever
   appears. Deeper nesting flattens to the one supported level — no résumé needs
   more. Reach for a real Markdown library only if that contract changes.

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

/* Code spans are UNWRAPPED, not turned into <code>. RESUME_PROMPT never asks for
   them and resume-lint doesn't flag them, so when one appears it is incidental —
   `Python` in a Skills line. Monospace boxes read wrong on a résumé, and the
   whole point of the rich flavour is a clean paste, so the backticks come off
   and the words stay. Both flavours strip them, which keeps them in step. */
const CODE_RE = /`([^`\n]+)`/g;

/* Inline spans. Order matters: escape first (so a stray < can't inject markup),
   then code spans (before anything can match inside one), then links, then BOLD
   BEFORE ITALIC — `**x**` must be consumed before the single-asterisk rule sees
   it, or it renders as an italic wrapping an asterisk. The leading (^|[\s(]) on
   the italic rules keeps mid-word underscores in identifiers from becoming
   emphasis. */
function inlineHtml(s) {
  return escapeHtml(s)
    .replace(CODE_RE, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
}

/** Leading-whitespace width of a line, tabs counted as two columns. */
const indentOf = (raw) => raw.match(/^[ \t]*/)[0].replace(/\t/g, '  ').length;

/** Markdown → HTML, for the rich-text clipboard flavour. */
export function mdToHtml(md) {
  const lines = String(md ?? '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let para = [];
  const stack = [];   // open list tags, outermost first
  const liOpen = [];  // parallel: is an <li> currently open at that level?

  /* Paragraph lines join with <br>, NOT " " — see the invariant note in the
     header. inlineHtml runs per line so a span can never straddle a break. */
  const flushPara = () => {
    if (para.length) { out.push(`<p>${para.map(inlineHtml).join('<br>')}</p>`); para = []; }
  };

  /* `</li>` is APPENDED to the previous entry rather than pushed as its own, so a
     flat item stays one line (`<li>One</li>`) and a nested list closes onto its
     parent (`</ul></li>`). Purely cosmetic for the clipboard; it keeps the output
     readable and the assertions legible. */
  const closeLiAt = (i) => { if (liOpen[i]) { out[out.length - 1] += '</li>'; liOpen[i] = false; } };
  const pushList = (tag) => { out.push(`<${tag}>`); stack.push(tag); liOpen.push(false); };
  /* Closing the deepest list also closes ITS <li>. The parent's <li> stays open
     on purpose — it is the element containing this nested list. */
  const popList = () => { closeLiAt(stack.length - 1); out.push(`</${stack.pop()}>`); liOpen.pop(); };
  const closeLists = () => { while (stack.length) popList(); };

  const emitItem = (tag, rawWant, html) => {
    // Clamp: never skip a level (an orphan indented bullet with no parent), and
    // never go deeper than one nesting level (the ponytail ceiling).
    const want = Math.min(rawWant, stack.length + 1, 2);
    while (stack.length > want) popList();
    if (stack.length === want && stack[want - 1] !== tag) popList();
    while (stack.length < want) pushList(tag);
    const i = stack.length - 1;
    closeLiAt(i); // close the previous sibling before opening this one
    out.push(`<li>${html}`);
    liOpen[i] = true;
  };

  for (const raw of lines) {
    const line = raw.trim();
    /* A blank line ends a PARAGRAPH but no longer ends a LIST. Closing here made
       `1.` / `2.` / `3.` separated by blank lines into three <ol> blocks that each
       rendered "1.". A list now closes when a non-list block actually arrives. */
    if (!line) { flushPara(); continue; }

    const heading = line.match(HEADING_RE);
    if (heading) {
      flushPara(); closeLists();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineHtml(heading[2])}</h${level}>`);
      continue;
    }

    // Checked before the bullet rule: `---` would otherwise read as a bullet.
    if (RULE_RE.test(line)) { flushPara(); closeLists(); out.push('<hr>'); continue; }

    const bullet = line.match(BULLET_RE);
    const numbered = bullet ? null : line.match(NUMBERED_RE);
    if (bullet || numbered) {
      flushPara();
      emitItem(bullet ? 'ul' : 'ol', indentOf(raw) >= 2 ? 2 : 1, inlineHtml((bullet || numbered)[1]));
      continue;
    }

    closeLists();
    para.push(line);
  }

  flushPara();
  closeLists();
  return out.join('\n');
}

/* Markdown → plain text, for the ATS flavour. Strips the SYNTAX and keeps the
   words. Bullets keep their ASCII "- " on purpose: swapping in "•" looks tidier
   but ships a non-ASCII character into parsers with a long history of mangling
   them, and the hyphen already reads as a list. */
export function mdToPlain(md) {
  const spans = (s) => s
    .replace(CODE_RE, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1$2')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1$2');

  return String(md ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((raw) => {
      const line = raw.trim();
      if (RULE_RE.test(line)) return '';
      /* Bullets are normalised to "- " FIRST, before the inline strips: BULLET_RE
         accepts -, * and +, and only the hyphen was surviving as written. A "* "
         marker also has to come off before the italic rule can see it. One level
         of indent is preserved so the plain flavour keeps the structure the rich
         flavour now nests. */
      const bullet = line.match(BULLET_RE);
      if (bullet) return `${indentOf(raw) >= 2 ? '  ' : ''}- ${spans(bullet[1])}`;
      return spans(line.replace(HEADING_RE, '$2'));
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
  /* The charset meta is HARDENING, not a diagnosed fix — it was not reproduced
     here, because that needs a real clipboard and a real paste target. A résumé
     is full of em dashes, en dashes and middots, and a text/html payload with no
     declared charset can be misdecoded by some Windows CF_HTML consumers. One
     line, no downside. */
  const html = `<meta charset="utf-8">${mdToHtml(markdown)}`;
  // Blobs are built synchronously so the write stays inside the user gesture —
  // Safari rejects a ClipboardItem assembled after an await.
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
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
  // A blank line between items must NOT split the list — three <ol>s each render "1.".
  check('a blank line does not split a numbered list', () =>
    eq(mdToHtml('1. One\n\n2. Two'), '<ol>\n<li>One</li>\n<li>Two</li>\n</ol>'));
  // Nesting goes INSIDE the parent <li>. A sibling <ul> is invalid and pastes
  // inconsistently between Docs and Word.
  check('an indented bullet nests inside its parent <li>', () =>
    eq(mdToHtml('- Parent\n  - Child'), '<ul>\n<li>Parent\n<ul>\n<li>Child</li>\n</ul></li>\n</ul>'));
  check('nesting deeper than one level is clamped, not skipped', () =>
    eq(mdToHtml('- A\n      - B'), '<ul>\n<li>A\n<ul>\n<li>B</li>\n</ul></li>\n</ul>'));
  check('an orphan indented bullet does not open two lists', () =>
    eq(mdToHtml('  - Orphan'), '<ul>\n<li>Orphan</li>\n</ul>'));

  // Paragraphs and rules.
  // THE regression: a role's title line and date line are two consecutive lines,
  // and joining them with " " put the date on the title's line in Google Docs.
  check('consecutive lines keep their break', () => eq(mdToHtml('one\ntwo'), '<p>one<br>two</p>'));
  check('a role header keeps title and dates on separate lines', () => {
    const html = mdToHtml('**Supply Chain Analyst**, Acme — New Bern, NC\n*March 2022 – Present*');
    has(html, '</strong>, Acme — New Bern, NC<br><em>March 2022 – Present</em>');
  });
  // The counterpart pin: a cover-letter paragraph is ONE unwrapped line
  // (EMIT_COVER_LETTER), so <br> must never fire on it.
  check('a cover-letter paragraph stays one line', () =>
    eq(mdToHtml('Hello,\n\nOne flowing paragraph.\n\nBest,'), '<p>Hello,</p>\n<p>One flowing paragraph.</p>\n<p>Best,</p>'));
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
  check('plain normalises * and + bullets to "- "', () =>
    eq(mdToPlain('* One\n+ Two'), '- One\n- Two'));
  check('plain keeps one level of bullet indent', () =>
    eq(mdToPlain('- Parent\n  - Child'), '- Parent\n  - Child'));

  // Code spans — RESUME_PROMPT never asks for them and resume-lint doesn't flag
  // them, so an incidental one must not ship literal backticks to either target.
  check('code spans are unwrapped in html', () => eq(mdToHtml('Built with `Python`'), '<p>Built with Python</p>'));
  check('code spans are unwrapped in plain', () => eq(mdToPlain('Built with `Python`'), 'Built with Python'));
  check('no backticks survive either flavour', () => {
    lacks(mdToHtml('- `React` and `Astro`'), '`');
    lacks(mdToPlain('- `React` and `Astro`'), '`');
  });

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

  /* THE CROSS-FLAVOUR INVARIANT. Both flavours describe the same document and may
     differ in markup, never in line structure. This is the property the shipped
     version violated — the HTML merged a role's title and date lines while the
     plain text kept them apart — and it is the one most likely to catch a future
     regression, because every fix above is a way of restoring it. Counting
     rendered LINES: block tags and <br> each start one in the rich flavour. */
  check('both flavours agree on line count', () => {
    const doc = [
      '# Ian Provencher',
      'New Bern, NC · ian-provencher.com',
      '',
      '## Experience',
      '',
      '**Supply Chain Analyst**, Acme — New Bern, NC',
      '*March 2022 – Present*',
      '',
      '- Owned MRP/BOM data across four plants',
      '  - Cut the planning cycle 30%',
      '- Rebuilt the nightly `SQL` extract',
      '',
      '## Skills',
      '',
      'Python, React, SAP',
    ].join('\n');
    const textLines = (s) => s.replace(/<br>/g, '\n').split('\n')
      .filter((l) => l.replace(/<[^>]+>/g, '').trim()).length; // markup-only lines carry no text
    eq(textLines(mdToHtml(doc)), textLines(mdToPlain(doc)));
  });

  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
}

// Guarded so the browser bundle (no `process`) never evaluates it.
if (typeof process !== 'undefined' && process.argv?.includes('--selftest')) selftest();
