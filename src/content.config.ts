// Content collections — one markdown file per entry.
//  - blog: /blog "Field notes" — authored articles + dragged-in posts. Detail pages.
//  - podcast: /podcast "AI From the Floor" — synced episodes, full transcript bodies.
//  - news: /news "Signal" — pinned articles with a why-it-matters summary tile.
//  - favorites: /favorites — a visual bookmarks board, categorized + grouped.
// Frontmatter-only for news + favorites (bodies never rendered — tiles link out).
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { BLOG_SOURCES } from './data/blog';
import { FAVORITE_CATEGORIES } from './data/favorites';
import { TIP_CATEGORIES } from './data/tips';
import { GLOSSARY_CATEGORIES } from './data/glossary';

// Full ISO-8601 WITH a UTC offset, enforced — a bare date parses as UTC
// midnight and mis-orders/mis-renders as the previous evening in ET.
const isoOffsetDateTime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?[+-]\d{2}:\d{2}$/,
    'publishedAt must be ISO-8601 with a UTC offset, e.g. 2026-07-07T14:32:00-04:00',
  )
  .transform((s) => new Date(s));

// Filenames carry a sortable YYYY-MM-DD- prefix; URLs/ids stay clean.
// An explicit `slug:` frontmatter field overrides.
const datePrefixId = ({ entry, data }: { entry: string; data: Record<string, unknown> }) =>
  (data.slug as string | undefined) ??
  entry.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog', generateId: datePrefixId }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string().max(100),
        /** Excerpt + <meta> description. */
        description: z.string().max(200),
        publishedAt: isoOffsetDateTime,
        updatedAt: isoOffsetDateTime.optional(),
        source: z.enum(BLOG_SOURCES).default('authored'),
        /** Link to the original post — required for dragged-in entries. */
        sourceUrl: z.string().url().optional(),
        tags: z.array(z.string()).default([]),
        draft: z.boolean().default(false),
        hero: image().optional(),
        heroAlt: z.string().optional(),
        /** Optional URL slug override (otherwise derived from the filename). */
        slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
      })
      .refine((d) => d.source === 'authored' || !!d.sourceUrl, {
        message: 'dragged-in entries (source !== authored) must carry a sourceUrl',
      }),
});

// Podcast — "AI From the Floor". Episodes are produced by a separate system and
// land here via `npm run sync:podcast`, never hand-authored. One file per episode,
// named <YYYY-MM-DD>.md (no trailing slug), so the id/URL is just the date.
//
// There is deliberately NO `show` field: one show exists. Omitting the axis is how
// "this is the only show" stays true structurally rather than by vigilance. `host`
// is likewise a constant, and lives once in src/data/podcast.ts.
const podcast = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/podcast', generateId: datePrefixId }),
  schema: z.object({
    title: z.string().max(120),
    /** The show's per-episode hook — feeds <itunes:subtitle>. */
    subtitle: z.string().max(160),
    /** <meta> description + the feed's per-item description. Apple/Spotify index
     *  it, and the producing renderer can emit an empty one — min(1) makes a blank
     *  description fail the build instead of silently shipping. */
    description: z.string().min(1).max(600),
    publishedAt: isoOffsetDateTime,
    /** Public audio URL (R2, media.ian-provencher.com) — the RSS <enclosure>. */
    audioUrl: z.string().url(),
    /** Exact byte length; a wrong <enclosure length> makes clients mis-seek. */
    audioBytes: z.number().int().positive(),
    /** "HH:MM:SS" — <itunes:duration>. */
    duration: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
    durationSec: z.number().int().positive(),
    draft: z.boolean().default(false),
  }),
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news', generateId: datePrefixId }),
  schema: z.object({
    /** MY framing of the item — not the source's verbatim headline. */
    title: z.string().min(6).max(140),
    /** The linked article. */
    url: z.string().url(),
    /** Publication / author (falls back to the URL host if omitted). */
    source: z.string().max(60).optional(),
    pinnedAt: isoOffsetDateTime,
    /** "Why this is relevant / how I used it" — the tile body. */
    summary: z.string().min(20).max(600),
    tags: z.array(z.string()).default([]),
    /** Sticks to the top of the feed. */
    pinned: z.boolean().default(false),
    /** Remote OG/thumbnail image. */
    image: z.string().url().optional(),
  }),
});

const favorites = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/favorites', generateId: datePrefixId }),
  schema: z.object({
    title: z.string().max(80),
    url: z.string().url(),
    category: z.enum(FAVORITE_CATEGORIES),
    /** Optional sub-cluster within a category. */
    group: z.string().max(40).optional(),
    /** Why it's a favorite. */
    description: z.string().max(240).optional(),
    tags: z.array(z.string()).default([]),
    /** Remote favicon/logo URL. */
    favicon: z.string().url().optional(),
    /** Manual sort within a category. */
    order: z.number().default(0),
  }),
});

const tips = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tips', generateId: datePrefixId }),
  schema: z.object({
    title: z.string().max(100),
    /** Excerpt + <meta> description. */
    description: z.string().max(200),
    category: z.enum(TIP_CATEGORIES),
    publishedAt: isoOffsetDateTime,
    updatedAt: isoOffsetDateTime.optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    /** Optional URL slug override (otherwise derived from the filename). */
    slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  }),
});

// Glossary + Learn additions authored through the admin console. The BULK of each
// section lives in src/data/*-terms.json / *-topics.json (authored offline); these
// collections hold only console-added entries, merged with the bulk at build time
// (see mergeGlossary / mergeLearn). Frontmatter-only; optional slug overrides the
// term/title-derived anchor (buildTerms/buildTopics honor it), else auto-derived.
const glossary = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/glossary', generateId: datePrefixId }),
  schema: z.object({
    term: z.string().max(80),
    definition: z.string().max(400),
    category: z.enum(GLOSSARY_CATEGORIES),
    aliases: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  }),
});

const learnResource = z.object({
  label: z.string().max(120),
  url: z.string().url(),
  note: z.string().max(160).optional(),
});
const learnLevel = z.object({
  primer: z.string().max(600),
  resources: z.array(learnResource).default([]),
});
const learn = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/learn', generateId: datePrefixId }),
  schema: z.object({
    title: z.string().max(120),
    category: z.enum(GLOSSARY_CATEGORIES),
    tagline: z.string().max(200).default(''),
    related: z.array(z.string()).default([]),
    levels: z.object({
      beginner: learnLevel,
      intermediate: learnLevel,
      advanced: learnLevel,
    }),
    slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  }),
});

export const collections = { blog, podcast, news, favorites, tips, glossary, learn };
