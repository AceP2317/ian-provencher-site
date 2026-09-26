/**
 * News / "Signal" helpers — the derived layer over the src/content/news
 * collection. Each entry is a pinned article with a why-it-matters summary tile.
 * Frontmatter-only (no body rendered); the card links out to the source.
 */
import type { CollectionEntry } from 'astro:content';

type Entry = CollectionEntry<'news'>;

/** Pinned first, then most-recently pinned. */
export const sortNews = (a: Entry, b: Entry): number => {
  if (a.data.pinned !== b.data.pinned) return a.data.pinned ? -1 : 1;
  return b.data.pinnedAt.getTime() - a.data.pinnedAt.getTime();
};

/** Hostname for the source label when none is given. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** `Jul 2026` — short pin date. */
export const pinnedLabel = (d: Date): string =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'short' }).format(d);
