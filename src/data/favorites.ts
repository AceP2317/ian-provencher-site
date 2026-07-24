/**
 * Favorites helpers — the derived layer over the src/content/favorites
 * collection: a visual bookmarks board, grouped by category (and optional group).
 */
import type { CollectionEntry } from 'astro:content';

/** Top-level board columns. Shared with content.config.ts (z.enum). */
export const FAVORITE_CATEGORIES = [
  'ai', 'dev-tools', 'docs', 'infra', 'design', 'supply-chain', 'reading', 'inspiration',
] as const;
export type FavoriteCategory = (typeof FAVORITE_CATEGORIES)[number];

export const CATEGORY_META: Record<FavoriteCategory, { label: string; icon: string; accent: string }> = {
  ai: { label: 'AI', icon: 'radar', accent: 'var(--color-indigo)' },
  'dev-tools': { label: 'Dev tools', icon: 'wrench', accent: 'var(--color-accent)' },
  docs: { label: 'Docs & references', icon: 'newspaper', accent: 'var(--color-cyan)' },
  infra: { label: 'Infrastructure', icon: 'network', accent: 'var(--color-cyan-deep)' },
  design: { label: 'Design', icon: 'palette', accent: 'var(--color-violet)' },
  'supply-chain': { label: 'Supply chain', icon: 'boxes', accent: 'var(--color-rose)' },
  reading: { label: 'Reading', icon: 'pen-line', accent: 'var(--color-label)' },
  inspiration: { label: 'Inspiration', icon: 'bookmark', accent: 'var(--color-up)' },
};

type Entry = CollectionEntry<'favorites'>;

/** Group entries by category (in the canonical order), each sorted by `order`. */
export function favoritesByCategory(entries: Entry[]) {
  return FAVORITE_CATEGORIES
    .map((category) => ({
      category,
      meta: CATEGORY_META[category],
      items: entries
        .filter((e) => e.data.category === category)
        .sort((a, b) => a.data.order - b.data.order),
    }))
    .filter((g) => g.items.length > 0);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
