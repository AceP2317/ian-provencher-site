/**
 * Learn helpers — the derived layer over the committed topic set in
 * src/data/learn-topics.json. A curated, leveled study module: each topic has a
 * short primer at three expertise levels, each pointing to the 2-3 best
 * resources for someone at that level. NO LLM — static authored content.
 *
 * Reuses the glossary's category vocabulary + CATEGORY_META (label/icon/accent)
 * so the two educational sections read as one system and can cross-link.
 * PUBLIC-SAFE: generic educational content only; the build-time gate is the backstop.
 */
import rawTopics from './learn-topics.json';
import { CATEGORY_META, GLOSSARY_CATEGORIES, type GlossaryCategory } from './glossary';

export { CATEGORY_META };
export type LearnCategory = GlossaryCategory;
export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type Level = (typeof LEVELS)[number];

export interface LearnResource {
  label: string;
  url: string;
  note?: string;
}
export interface LearnLevel {
  primer: string;
  resources: LearnResource[];
}
export interface LearnTopic {
  slug: string;
  title: string;
  category: LearnCategory;
  tagline: string;
  related: string[];
  levels: Record<Level, LearnLevel>;
}

export interface RawTopic {
  slug?: string;
  title: string;
  category: string;
  tagline?: string;
  related?: string[];
  levels?: Partial<Record<Level, { primer?: string; resources?: LearnResource[] }>>;
}

const CATSET = new Set<string>(GLOSSARY_CATEGORIES);

function slugify(s: string): string {
  const slug = String(s || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'topic';
}

const cleanResources = (rs: unknown): LearnResource[] =>
  Array.isArray(rs)
    ? rs
        .filter((r): r is LearnResource => !!r && typeof r === 'object' && typeof (r as LearnResource).url === 'string')
        .map((r) => ({ label: String(r.label || '').trim(), url: String(r.url).trim(), note: r.note ? String(r.note).trim() : undefined }))
    : [];

const emptyLevel: LearnLevel = { primer: '', resources: [] };

/** Load → validate category → dedupe by slug → normalize each level. */
export function buildTopics(raw: RawTopic[]): LearnTopic[] {
  const usedSlugs = new Set<string>();
  const out: LearnTopic[] = [];
  for (const cat of GLOSSARY_CATEGORIES) {
    for (const r of raw) {
      if (r.category !== cat || !CATSET.has(r.category)) continue;
      const title = String(r.title || '').trim();
      if (!title) continue;
      let slug = slugify(r.slug || title);
      let unique = slug;
      let n = 2;
      while (usedSlugs.has(unique)) unique = `${slug}-${n++}`;
      usedSlugs.add(unique);
      const levels = LEVELS.reduce((acc, lvl) => {
        const l = r.levels?.[lvl];
        acc[lvl] = l ? { primer: String(l.primer || '').trim(), resources: cleanResources(l.resources) } : { ...emptyLevel };
        return acc;
      }, {} as Record<Level, LearnLevel>);
      out.push({
        slug: unique,
        title,
        category: cat,
        tagline: String(r.tagline || '').trim(),
        related: Array.isArray(r.related) ? r.related.map((x) => String(x).trim()).filter(Boolean) : [],
        levels,
      });
    }
  }
  return out;
}

export const learnTopics: LearnTopic[] = buildTopics(rawTopics as unknown as RawTopic[]);

/**
 * Merge admin-authored additions (from the `learn` content collection) with the
 * bulk JSON base and rebuild. buildTopics dedupes by slug. Called from the page +
 * search index (which pass in the collection entries — a .ts module can't fetch).
 */
export function mergeLearn(additions: RawTopic[] = []): LearnTopic[] {
  return additions.length ? buildTopics([...(rawTopics as unknown as RawTopic[]), ...additions]) : learnTopics;
}

/** The categories that actually have topics (for the filter chips). */
export function learnCategories() {
  return GLOSSARY_CATEGORIES.filter((c) => learnTopics.some((t) => t.category === c)).map((c) => ({ category: c, meta: CATEGORY_META[c] }));
}
