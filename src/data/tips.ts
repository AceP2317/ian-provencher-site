/**
 * Tips helpers — the derived layer over src/content/tips. Small, day-to-day
 * optimizations, workflows, and settings; each tip gets a detail page. Mirrors
 * blog.ts and reuses its date formatting so ET rendering stays identical.
 */
import type { CollectionEntry } from 'astro:content';
import { formatEntryDate, isoDate } from './blog';

// Re-export so tips pages import date helpers from one place.
export { formatEntryDate, isoDate };

/** Tip taxonomy. Shared with content.config.ts (z.enum). */
export const TIP_CATEGORIES = ['optimization', 'workflow', 'tooling', 'ai', 'ops'] as const;
export type TipCategory = (typeof TIP_CATEGORIES)[number];

type Entry = CollectionEntry<'tips'>;

/** Chip per category — label + token-driven dot color (follows any re-skin). */
export const CATEGORY_META: Record<TipCategory, { label: string; dot: string }> = {
  optimization: { label: 'Optimization', dot: 'var(--color-accent)' }, // amber
  workflow: { label: 'Workflow', dot: 'var(--color-cyan)' },
  tooling: { label: 'Tooling', dot: 'var(--color-indigo)' },
  ai: { label: 'AI', dot: 'var(--color-green)' },
  ops: { label: 'Ops', dot: 'var(--color-label)' }, // sand
};

/** The one draft filter — dev shows drafts, PROD hides them. */
export const publishedFilter = ({ data }: Entry): boolean =>
  import.meta.env.PROD ? !data.draft : true;

/** Newest first. */
export const sortByPublished = (a: Entry, b: Entry): number =>
  b.data.publishedAt.getTime() - a.data.publishedAt.getTime();

/** JSON-LD for /tips/ — CollectionPage + BreadcrumbList. */
export function tipsSchema(origin: string, tips: Entry[]): Record<string, unknown>[] {
  const url = `${origin}/tips/`;
  return [
    {
      '@type': 'CollectionPage',
      '@id': `${url}#tips`,
      name: 'Ian Provencher — Tips & Tricks',
      url,
      description: 'The small optimizations, workflows, and settings I use day to day.',
      isPartOf: { '@id': `${origin}/#website` },
      about: { '@id': `${origin}/#person` },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Tips & Tricks' },
      ],
    },
  ];
}

/** JSON-LD for a tip page — TechArticle + BreadcrumbList. */
export function tipSchema(entry: Entry, origin: string): Record<string, unknown>[] {
  const url = `${origin}/tips/${entry.id}/`;
  return [
    {
      '@type': 'TechArticle',
      '@id': `${url}#tip`,
      headline: entry.data.title,
      description: entry.data.description,
      datePublished: isoDate(entry.data.publishedAt),
      ...(entry.data.updatedAt ? { dateModified: isoDate(entry.data.updatedAt) } : {}),
      url,
      mainEntityOfPage: url,
      isPartOf: { '@id': `${origin}/tips/#tips` },
      author: { '@id': `${origin}/#person` },
      ...(entry.data.tags.length ? { keywords: entry.data.tags.join(', ') } : {}),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Tips & Tricks', item: `${origin}/tips/` },
        { '@type': 'ListItem', position: 3, name: entry.data.title },
      ],
    },
  ];
}
