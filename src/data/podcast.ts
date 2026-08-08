/**
 * Podcast helpers — the derived layer over src/content/podcast.
 *
 * "AI From the Floor" is the show: a daily AI news podcast hosted by Cam (an AI
 * persona), read through an operator's lens. Episodes arrive as GitHub Releases
 * from the producing system and land here via `npm run sync:podcast`
 * (scripts/sync-podcast.mjs); this file owns everything the per-episode
 * artifacts DON'T carry — the channel-level identity that the RSS feed, the
 * pages, and the cover-art generator all read from.
 *
 * Mirrors blog.ts/tips.ts and reuses blog.ts's date formatting so ET rendering
 * stays identical across every section.
 */
import type { CollectionEntry } from 'astro:content';
import { formatEntryDate, isoDate } from './blog';

// Re-export so podcast pages import date helpers from one place.
export { formatEntryDate, isoDate };

type Entry = CollectionEntry<'podcast'>;

// ── Channel-level identity ─────────────────────────────────────────────────
// Brand is fixed and NOT episode data: the artifacts carry episode-level fields
// only. Subtitle + description are SEO-critical — Apple and Spotify index them.

export const SHOW = 'AI From the Floor';
export const HOST = 'Cam';

export const SHOW_SUBTITLE = "Daily AI news, read through an operator's lens.";

export const SHOW_DESCRIPTION =
  'AI From the Floor takes the whole day of AI news, sorts the signal from the noise, ' +
  'and hands it back the way it lands if you actually run things — a plant, a supply ' +
  'chain, an ERP, a back office. No hype, no breaking-news theatrics: what changed, and ' +
  "what you'd do about it. Hosted by Cam, who is an AI — the system Ian Provencher built " +
  'to run his operation, now running the show.';

/**
 * Apple REQUIRES <itunes:owner><itunes:email> and mails a verification code to
 * it, so this must be a genuinely deliverable address. It deliberately is NOT
 * the operator's personal address: scripts/lib/denylist.mjs HARD-blocks the
 * `ian42*@…` shape, so a personal address here would fail the build gate — and
 * publishing it would put a personal inbox in a feed anyone can fetch.
 */
export const OWNER_EMAIL = 'podcast@ian-provencher.com';

/** Square cover art (3000x3000), emitted by scripts/gen-assets.mjs. */
export const COVER_PATH = '/podcast/cover.jpg';

/** Apple's category vocabulary — "Technology" is a valid top-level term. */
export const CATEGORY = 'Technology';

/** Where the audio is actually served from (R2, custom domain). */
export const MEDIA_BASE = 'https://media.ian-provencher.com/podcast/ai-from-the-floor/';

// ── Collection helpers ─────────────────────────────────────────────────────

/** The one draft filter — dev shows drafts, PROD hides them. */
export const publishedFilter = ({ data }: Entry): boolean =>
  import.meta.env.PROD ? !data.draft : true;

/** Newest first. */
export const sortByPublished = (a: Entry, b: Entry): number =>
  b.data.publishedAt.getTime() - a.data.publishedAt.getTime();

/** `1465` → `"24 min"`. Rounds up so a 40-second episode isn't "0 min". */
export const formatDuration = (sec: number): string => `${Math.max(1, Math.round(sec / 60))} min`;

/**
 * Escape for RAW XML insertion. @astrojs/rss escapes its first-class fields
 * (title/description/enclosure) but splices `customData` in verbatim — and the
 * episode titles are machine-generated, so an unescaped `&` would silently emit
 * a malformed feed that Apple rejects outright.
 */
export const xmlEscape = (s: string): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ── JSON-LD ────────────────────────────────────────────────────────────────

/** JSON-LD for /podcast/ — PodcastSeries + BreadcrumbList. */
export function podcastSchema(origin: string, episodes: Entry[]): Record<string, unknown>[] {
  const url = `${origin}/podcast/`;
  return [
    {
      '@type': 'PodcastSeries',
      '@id': `${url}#show`,
      name: SHOW,
      url,
      description: SHOW_DESCRIPTION,
      image: `${origin}${COVER_PATH}`,
      webFeed: `${origin}/podcast/rss.xml`,
      inLanguage: 'en-US',
      author: { '@id': `${origin}/#person` },
      hasPart: episodes.map((e) => ({ '@id': `${origin}/podcast/${e.id}/#episode` })),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Podcast' },
      ],
    },
  ];
}

/** JSON-LD for an episode page — PodcastEpisode + BreadcrumbList. */
export function episodeSchema(entry: Entry, origin: string): Record<string, unknown>[] {
  const url = `${origin}/podcast/${entry.id}/`;
  return [
    {
      '@type': 'PodcastEpisode',
      '@id': `${url}#episode`,
      name: entry.data.title,
      description: entry.data.description,
      datePublished: isoDate(entry.data.publishedAt),
      url,
      mainEntityOfPage: url,
      partOfSeries: { '@id': `${origin}/podcast/#show` },
      author: { '@id': `${origin}/#person` },
      associatedMedia: {
        '@type': 'AudioObject',
        contentUrl: entry.data.audioUrl,
        encodingFormat: 'audio/mpeg',
        contentSize: String(entry.data.audioBytes),
        duration: `PT${entry.data.durationSec}S`,
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Podcast', item: `${origin}/podcast/` },
        { '@type': 'ListItem', position: 3, name: entry.data.title },
      ],
    },
  ];
}
