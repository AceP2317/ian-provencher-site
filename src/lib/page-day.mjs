/* The rule behind each page's "updated" day (D94), kept free of Astro and of build-time constants so
 * scripts/check-stamp.mjs --selftest can run it on fixtures. src/lib/page-date.ts feeds it the real
 * days and the freshness ledger.
 *
 * A one-file page dates from its file under src/pages. A page a shared template draws dates from
 * what it renders: its post (src/content/<collection>/<id>.md) or the data file it names, never the
 * template. Either way a data section's ledger day (lastChanged) counts too, and the newest wins.
 * Null is said rather than guessed, and the check refuses an undated page on a whole history. */

/** "src/pages/blog/[slug].astro" → "/blog/[slug]"; "src/pages/index.astro" → "/". */
export function routeOfFile(file) {
  const p = file.slice('src/pages'.length).replace(/\.(astro|md|mdx|ts|js)$/, '').replace(/\/index$/, '');
  return p || '/';
}

/**
 * @param {Record<string, string> | null} days  file → YYYY-MM-DD, or null for a partial history
 * @param {Record<string, { lastChanged?: string }>} sections  the freshness ledger's sections
 * @param {{ routePattern: string, dataSlug?: string, dataDate?: string, sources?: string[] }} page
 * @returns {string | null}
 */
export function pageDayFrom(days, sections, { routePattern, dataSlug, dataDate, sources = [] }) {
  if (!days) return null;
  const pattern = routePattern.replace(/\/$/, '') || '/';
  const page = Object.keys(days).find((f) => f.startsWith('src/pages/') && routeOfFile(f) === pattern);
  if (!page) return null;
  // A template drawing posts must be handed the post's own file; the post's address is not its file
  // name (blog drops the date prefix), so it is never guessed.
  const collection = pattern.split('/')[1];
  const draws = pattern.includes('[') && Object.keys(days).some((f) => f.startsWith(`src/content/${collection}/`));
  if (draws && !sources.some((f) => f.startsWith(`src/content/${collection}/`) && f in days)) return null;
  // A shared template is layout, not content (measured live 2026-10-08: a 25 Sep post read 8 Oct
  // after its template gained a prop).
  const own = pattern.includes('[') && sources.length ? sources : [page, ...sources];
  const found = own.map((f) => days[f]).filter(Boolean);
  const dataDay = (dataSlug ? sections[dataSlug]?.lastChanged : undefined) ?? dataDate;
  if (dataDay) found.push(dataDay);
  return found.sort().at(-1) ?? null;
}
