/**
 * Glossary helpers — the derived layer over the committed term set in
 * src/data/glossary-terms.json (a public-safe technical dictionary, authored as
 * bulk data, NOT through the admin console). One source of truth for the category
 * vocabulary lives here; slugs + dedupe are computed at load. Modeled on the
 * favorites board (src/data/favorites.ts).
 *
 * PUBLIC-SAFE: standard technical vocabulary only — no employer, person, private
 * repo, IP, or internal-system detail. The build-time safety gate is the backstop.
 */
import rawTerms from './glossary-terms.json';

/** Category columns, in canonical display order. */
export const GLOSSARY_CATEGORIES = [
  'ai', 'software', 'web', 'data', 'infra', 'security', 'systems', 'supply-chain',
] as const;
export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number];

export const CATEGORY_META: Record<GlossaryCategory, { label: string; icon: string; accent: string }> = {
  ai: { label: 'AI & Machine Learning', icon: 'brain', accent: 'var(--color-indigo)' },
  software: { label: 'Software Development', icon: 'code', accent: 'var(--color-accent)' },
  web: { label: 'Web & Frontend', icon: 'globe', accent: 'var(--color-cyan)' },
  data: { label: 'Data & Databases', icon: 'database', accent: 'var(--color-cyan-deep)' },
  infra: { label: 'Infrastructure & DevOps', icon: 'server', accent: 'var(--color-green)' },
  security: { label: 'Security', icon: 'shield', accent: 'var(--color-rose)' },
  systems: { label: 'Systems & Networking', icon: 'cpu', accent: 'var(--color-violet)' },
  'supply-chain': { label: 'Supply Chain & Operations', icon: 'boxes', accent: 'var(--color-label)' },
};

export interface GlossaryTerm {
  term: string;
  slug: string;
  definition: string;
  category: GlossaryCategory;
  aliases: string[];
  tags: string[];
}

export interface RawTerm {
  term: string;
  definition: string;
  category: string;
  aliases?: string[];
  tags?: string[];
  /** Optional slug override (console-authored terms); otherwise derived from the term. */
  slug?: string;
}

function slugify(s: string): string {
  const slug = String(s || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'term';
}

const CATSET = new Set<string>(GLOSSARY_CATEGORIES);

/**
 * Load → validate category → dedupe by normalized term (first occurrence in
 * category order wins, so a term claimed by two authors lands in the earlier
 * category) → assign a unique slug.
 */
export function buildTerms(raw: RawTerm[]): GlossaryTerm[] {
  const seen = new Set<string>();
  const usedSlugs = new Set<string>();
  const out: GlossaryTerm[] = [];
  for (const cat of GLOSSARY_CATEGORIES) {
    for (const r of raw) {
      if (r.category !== cat || !CATSET.has(r.category)) continue;
      const term = String(r.term || '').trim();
      const definition = String(r.definition || '').trim();
      if (!term || !definition) continue;
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      let slug = slugify(r.slug || term);
      let unique = slug;
      let n = 2;
      while (usedSlugs.has(unique)) unique = `${slug}-${n++}`;
      usedSlugs.add(unique);
      out.push({
        term,
        slug: unique,
        definition,
        category: cat,
        aliases: Array.isArray(r.aliases) ? r.aliases.map((a) => String(a).trim()).filter(Boolean) : [],
        tags: Array.isArray(r.tags) ? r.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [],
      });
    }
  }
  return out;
}

export const glossaryTerms: GlossaryTerm[] = buildTerms(rawTerms as unknown as RawTerm[]);

/**
 * Merge admin-authored additions (from the `glossary` content collection) with
 * the bulk JSON base and rebuild. buildTerms dedupes the union by normalized term
 * and re-slugs, so a duplicate of an existing term is dropped, not doubled. Called
 * from the page + the search index (a plain .ts module can't call getCollection —
 * the .astro/endpoint context passes the collection entries in).
 */
export function mergeGlossary(additions: RawTerm[] = []): GlossaryTerm[] {
  return additions.length ? buildTerms([...(rawTerms as unknown as RawTerm[]), ...additions]) : glossaryTerms;
}

/** Group terms by category (canonical order), each sorted alphabetically. */
export function glossaryByCategory(terms: GlossaryTerm[] = glossaryTerms) {
  return GLOSSARY_CATEGORIES
    .map((category) => ({
      category,
      meta: CATEGORY_META[category],
      items: terms
        .filter((t) => t.category === category)
        .sort((a, b) => a.term.toLowerCase().localeCompare(b.term.toLowerCase())),
    }))
    .filter((g) => g.items.length > 0);
}

/** The lowercased haystack a card is filtered against (term + aliases + def + tags). */
export function glossaryHaystack(t: GlossaryTerm): string {
  return `${t.term} ${t.aliases.join(' ')} ${t.definition} ${t.tags.join(' ')}`.toLowerCase();
}
