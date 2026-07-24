/**
 * Blog helpers — the derived layer over the src/content/blog collection.
 * Single source for source badges, the draft filter, date formatting (always
 * America/New_York), and the JSON-LD builders. Every entry gets a detail page;
 * "dragged-in" entries (source !== 'authored') also carry a sourceUrl to the
 * original.
 */
import type { CollectionEntry } from 'astro:content';

/** Where an entry originated. Shared with content.config.ts (z.enum). */
export const BLOG_SOURCES = ['authored', 'linkedin', 'x', 'press', 'external'] as const;
export type BlogSource = (typeof BLOG_SOURCES)[number];

type Entry = CollectionEntry<'blog'>;

/** Badge chip per source — label + status-dot color. */
// Dots are used as inline CSS `background` values, so they reference the design
// tokens directly — the badge colors follow any re-skin of the token block.
export const SOURCE_META: Record<BlogSource, { label: string; dot: string }> = {
  authored: { label: 'Written here', dot: 'var(--color-accent)' }, // amber
  linkedin: { label: 'LinkedIn', dot: 'var(--color-cyan)' },
  x: { label: 'X', dot: 'var(--color-ink-muted)' },
  press: { label: 'Press', dot: 'var(--color-label)' }, // sand
  external: { label: 'External', dot: 'var(--color-green)' },
};

/**
 * The one draft filter — used by the index, getStaticPaths, AND the RSS endpoint
 * so draft-leak can't drift. Dev shows drafts (the review surface); PROD hides them.
 */
export const publishedFilter = ({ data }: Entry): boolean =>
  import.meta.env.PROD ? !data.draft : true;

/** Newest first. */
export const sortByPublished = (a: Entry, b: Entry): number =>
  b.data.publishedAt.getTime() - a.data.publishedAt.getTime();

/** `2026-07-07 · 14:32 ET` — always rendered in America/New_York. */
export function formatEntryDate(d: Date): string {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
  return `${day} · ${time} ET`;
}

/** Machine-readable ISO string for <time datetime> and JSON-LD. */
export const isoDate = (d: Date): string => d.toISOString();

/** Rough reading time in minutes from the raw markdown body (~200 wpm, min 1). */
export function readingMinutes(body: string | undefined): number {
  const words = String(body || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** JSON-LD for the /blog/ index — Blog node + BreadcrumbList. */
export function blogSchema(origin: string, articles: Entry[]): Record<string, unknown>[] {
  const url = `${origin}/blog/`;
  return [
    {
      '@type': 'Blog',
      '@id': `${url}#blog`,
      name: 'Ian Provencher — Field notes',
      url,
      description: 'Field notes from the workbench — what I build, why, and what I learn.',
      author: { '@id': `${origin}/#person` },
      blogPost: articles.map((a) => ({ '@id': `${origin}/blog/${a.id}/#post` })),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog' },
      ],
    },
  ];
}

/** JSON-LD for an article page — BlogPosting + BreadcrumbList. */
export function postSchema(entry: Entry, origin: string): Record<string, unknown>[] {
  const url = `${origin}/blog/${entry.id}/`;
  return [
    {
      '@type': 'BlogPosting',
      '@id': `${url}#post`,
      headline: entry.data.title,
      description: entry.data.description,
      datePublished: isoDate(entry.data.publishedAt),
      ...(entry.data.updatedAt ? { dateModified: isoDate(entry.data.updatedAt) } : {}),
      url,
      mainEntityOfPage: url,
      isPartOf: { '@id': `${origin}/blog/#blog` },
      author: { '@id': `${origin}/#person` },
      ...(entry.data.tags.length ? { keywords: entry.data.tags.join(', ') } : {}),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${origin}/blog/` },
        { '@type': 'ListItem', position: 3, name: entry.data.title },
      ],
    },
  ];
}
