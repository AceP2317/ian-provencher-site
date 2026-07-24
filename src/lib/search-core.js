/* ============================================================================
   search-core — the site search engine, shared by both surfaces:
     • SearchOverlay.jsx — the ⌘K / "/" command-palette modal
     • HeaderSearch.jsx  — the persistent header search bar (live results)

   React-free and side-effect-free at module scope (SSR-safe). A build-time
   index (/search-index.json) is fetched lazily and cached at module level, so
   whichever surface loads it first, both share the one fetch + normalize.
   ============================================================================ */

export const RESULT_CAP = 30;

// ── pure matcher helpers ─────────────────────────────────────────────────────

/** Lowercase + strip diacritics so "café" matches "cafe". */
const COMBINING = /[̀-ͯ]/g; // combining diacritical marks
export const deburr = (s) => String(s ?? '').normalize('NFD').replace(COMBINING, '');
export const norm = (s) => deburr(s).toLowerCase();
export const words = (s) => s.split(/[^a-z0-9]+/).filter(Boolean);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Attach cached, normalized haystacks to a raw record (done once on load). */
export function normalizeRecord(r) {
  const t = norm(r.title);
  const k = norm(r.keywords);
  const e = norm(r.excerpt);
  return { ...r, _title: t, _keywords: k, _excerpt: e, _tw: words(t), _kw: words(k), _ew: words(e) };
}

// Per-field score weights: [exact-word, word-prefix, substring].
const W_TITLE = [12, 8, 4];
const W_KEYWORDS = [6, 4, 2];
const W_EXCERPT = [4, 2.5, 1];

function fieldScore(hay, wordList, token, w) {
  if (!hay.includes(token)) return 0;
  if (wordList.includes(token)) return w[0];
  for (const word of wordList) if (word.startsWith(token)) return w[1];
  return w[2];
}

/**
 * Score every record for the query. Multi-term AND: every token must hit some
 * field or the record is dropped. Returns the full matched set, sorted.
 */
export function runSearch(index, query) {
  const q = query.trim();
  if (!q || !index) return [];
  const tokens = norm(q).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const qFull = tokens.join(' ');

  const out = [];
  for (const r of index) {
    let sum = 0;
    let allInTitle = true;
    let ok = true;
    for (const tok of tokens) {
      const tScore = fieldScore(r._title, r._tw, tok, W_TITLE);
      const kScore = fieldScore(r._keywords, r._kw, tok, W_KEYWORDS);
      const eScore = fieldScore(r._excerpt, r._ew, tok, W_EXCERPT);
      const best = Math.max(tScore, kScore, eScore);
      if (best === 0) { ok = false; break; }
      if (tScore === 0) allInTitle = false;
      sum += best;
    }
    if (!ok) continue;
    let score = r.weight + sum;
    if (r._title.startsWith(qFull)) score += 10; // whole query prefixes the title
    if (allInTitle) score += 6;                   // every token landed in the title
    out.push({ rec: r, score });
  }

  out.sort((a, b) =>
    b.score - a.score ||
    b.rec.weight - a.rec.weight ||
    a.rec.title.localeCompare(b.rec.title),
  );
  return out;
}

/**
 * Split text into [{ text, hit }] segments, one per case-insensitive token hit.
 * Framework-agnostic — each consumer renders `hit` segments as <mark>.
 */
export function highlightSegments(text, tokens) {
  const str = String(text ?? '');
  if (!str || !tokens || !tokens.length) return [{ text: str, hit: false }];
  const re = new RegExp(`(${tokens.map(escapeRe).join('|')})`, 'gi');
  const set = new Set(tokens.map((t) => t.toLowerCase()));
  return str.split(re).map((part) => ({ text: part, hit: !!part && set.has(norm(part)) }));
}

// ── lazy, module-cached index load (shared by both surfaces) ──────────────────

let INDEX_CACHE = null;
let INDEX_PROMISE = null;

/** Resolve the normalized search index — first caller fetches, all share it. */
export function loadIndex() {
  if (INDEX_CACHE) return Promise.resolve(INDEX_CACHE);
  if (!INDEX_PROMISE) {
    INDEX_PROMISE = fetch('/search-index.json')
      .then((r) => r.json())
      .then((data) => { INDEX_CACHE = data.map(normalizeRecord); return INDEX_CACHE; })
      .catch(() => { INDEX_CACHE = []; return INDEX_CACHE; });
  }
  return INDEX_PROMISE;
}
