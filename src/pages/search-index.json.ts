/**
 * /search-index.json — the build-time, public-safe search index.
 *
 * A single flat array of lean SearchRecords, prerendered at build time from the
 * SAME public data every page renders from (never raw private sources). The
 * client island (islands/SearchOverlay.jsx) fetches this once, normalizes it,
 * and runs a hand-rolled matcher over it — zero runtime cost, zero npm deps.
 *
 * Drafts are dropped by publishedFilter (PROD only); no /admin record is ever
 * emitted. Every internal url carries a trailing slash (trailingSlash: 'always').
 */
export const prerender = true;

import { getCollection } from 'astro:content';
import { SECTIONS, bySlug } from '../data/sections';
import { publishedFilter as blogPublished } from '../data/blog';
import { publishedFilter as podcastPublished } from '../data/podcast';
import { publishedFilter as tipsPublished } from '../data/tips';
import { architectures, archSlug } from '../data/architectures';
import { repos } from '../data/repos';
import { tools } from '../data/tools';
import { cronJobs } from '../data/cron';
import { appGroups } from '../data/apps';
import { routineGroups } from '../data/routines';
import { doctrineClauses, fableFacets, hooks, statusRows, stackPages } from '../data/stack';
import { jobs, applyUrl } from '../data/jobs';
import { anthropicResources } from '../data/anthropic';
import { resume } from '../data/resume';
import { mergeGlossary } from '../data/glossary';
import { mergeLearn } from '../data/learn';

interface SearchRecord {
  id: string;
  title: string;
  type: string;
  typeLabel: string;
  section: string;
  accent: 'accent' | 'cyan' | 'indigo' | 'green';
  url: string;
  external: boolean;
  excerpt: string;
  keywords: string;
  weight: number;
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Strip markdown to a flat text haystack; optional char cap. */
function plain(md: unknown, max = 0): string {
  let s = String(md ?? '')
    .replace(/```[\s\S]*?```/g, ' ')          // fenced code blocks
    .replace(/`[^`]*`/g, ' ')                 // inline code
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images → alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // links → link text
    .replace(/<[^>]+>/g, ' ')                 // stray HTML tags
    .replace(/^\s{0,3}[>#\-*+]+\s+/gm, ' ')   // leading block markers
    .replace(/[*_~`>#|]+/g, ' ')              // stray md punctuation
    .replace(/\s+/g, ' ')
    .trim();
  return max > 0 ? s.slice(0, max) : s;
}

/** Truncate a display string with an ellipsis. */
function cap(s: unknown, n = 160): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** Bare hostname for a URL (www-stripped), guarded. */
function host(url: unknown): string {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Flatten + join haystack parts, cap ~400 chars. */
function kw(...parts: unknown[]): string {
  return parts
    .flat(Infinity)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

const slugify = (s: unknown): string =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

/** Section accent token, defaulting to amber. */
const accentOf = (slug: string): SearchRecord['accent'] => bySlug.get(slug)?.accent ?? 'accent';

const isHttp = (u: unknown): boolean => /^https?:\/\//i.test(String(u ?? ''));

// ── build the records ────────────────────────────────────────────────────────

export async function GET() {
  const records: SearchRecord[] = [];

  // Blog
  const blog = await getCollection('blog', blogPublished);
  for (const e of blog) {
    records.push({
      id: `blog:${e.id}`,
      title: e.data.title,
      type: 'blog',
      typeLabel: 'Blog',
      section: 'blog',
      accent: accentOf('blog'),
      url: `/blog/${e.id}/`,
      external: false,
      excerpt: cap(e.data.description),
      keywords: kw(e.data.tags, plain(e.body, 400)),
      weight: 3,
    });
  }

  // Podcast — one record per episode. The transcript body is thousands of words,
  // so plain() caps it like every other collection; the title/subtitle carry the match.
  const podcast = await getCollection('podcast', podcastPublished);
  for (const e of podcast) {
    records.push({
      id: `podcast:${e.id}`,
      title: e.data.title,
      type: 'podcast',
      typeLabel: 'Podcast',
      section: 'podcast',
      accent: accentOf('podcast'),
      url: `/podcast/${e.id}/`,
      external: false,
      excerpt: cap(e.data.description),
      keywords: kw([e.data.subtitle], plain(e.body, 400)),
      weight: 3,
    });
  }

  // Tips
  const tips = await getCollection('tips', tipsPublished);
  for (const e of tips) {
    records.push({
      id: `tip:${e.id}`,
      title: e.data.title,
      type: 'tip',
      typeLabel: 'Tip',
      section: 'tips',
      accent: accentOf('tips'),
      url: `/tips/${e.id}/`,
      external: false,
      excerpt: cap(e.data.description),
      keywords: kw(e.data.category, e.data.tags, plain(e.body, 400)),
      weight: 3,
    });
  }

  // Architectures
  for (const a of architectures) {
    records.push({
      id: `arch:${a.id}`,
      title: a.title,
      type: 'arch',
      typeLabel: 'Architecture',
      section: 'architectures',
      accent: accentOf('architectures'),
      url: `/architectures/${archSlug(a.id)}/`,
      external: false,
      excerpt: cap(a.tagline),
      keywords: kw(
        plain(a.story, 400),
        a.nodes.map((n) => n.label),
        a.walkthrough.map((w) => w.title),
      ),
      weight: 3,
    });
  }

  // Signal (news) — external
  const news = await getCollection('news');
  for (const e of news) {
    records.push({
      id: `signal:${e.id}`,
      title: e.data.title,
      type: 'signal',
      typeLabel: 'Signal',
      section: 'news',
      accent: accentOf('news'),
      url: e.data.url,
      external: true,
      excerpt: cap(e.data.summary, 160),
      keywords: kw(e.data.tags, host(e.data.url), e.data.source),
      weight: 1.5,
    });
  }

  // Favorites — external
  const favorites = await getCollection('favorites');
  for (const e of favorites) {
    records.push({
      id: `favorite:${e.id}`,
      title: e.data.title,
      type: 'favorite',
      typeLabel: 'Favorite',
      section: 'favorites',
      accent: accentOf('favorites'),
      url: e.data.url,
      external: true,
      excerpt: cap(e.data.description ?? ''),
      keywords: kw(e.data.category, e.data.group, e.data.tags, host(e.data.url)),
      weight: 1.5,
    });
  }

  // Anthropic resources — external (mirrors the Favorites block)
  for (const r of anthropicResources) {
    records.push({
      id: `anthropic:${slugify(r.title)}`,
      title: r.title,
      type: 'anthropic',
      typeLabel: 'Anthropic',
      section: 'anthropic',
      accent: accentOf('anthropic'),
      url: r.url,
      external: true,
      excerpt: cap(r.description ?? ''),
      keywords: kw(r.category, r.tier, r.tags, host(r.url)),
      weight: 1.5,
    });
  }

  // Glossary — internal (deep-link to each term's anchor); bulk JSON + admin additions
  const glossaryAdditions = (await getCollection('glossary')).map((e) => e.data);
  for (const t of mergeGlossary(glossaryAdditions)) {
    records.push({
      id: `term:${t.slug}`,
      title: t.term,
      type: 'term',
      typeLabel: 'Glossary',
      section: 'glossary',
      accent: accentOf('glossary'),
      url: `/glossary/#${t.slug}`,
      external: false,
      excerpt: cap(t.definition),
      keywords: kw(t.category, t.aliases, t.tags),
      weight: 2,
    });
  }

  // Learn — internal (deep-link to each topic's anchor); bulk JSON + admin additions
  const learnAdditions = (await getCollection('learn')).map((e) => e.data);
  for (const t of mergeLearn(learnAdditions)) {
    records.push({
      id: `lesson:${t.slug}`,
      title: t.title,
      type: 'lesson',
      typeLabel: 'Learn',
      section: 'learn',
      accent: accentOf('learn'),
      url: `/learn/#${t.slug}`,
      external: false,
      excerpt: cap(t.tagline),
      keywords: kw(t.category, t.related, t.levels.beginner.primer),
      weight: 2,
    });
  }

  // Repos — external
  for (const r of repos) {
    records.push({
      id: `repo:${slugify(r.name)}`,
      title: r.name,
      type: 'repo',
      typeLabel: 'Repository',
      section: 'repos',
      accent: accentOf('repos'),
      url: r.url,
      external: true,
      excerpt: cap(r.description),
      keywords: kw(r.language, r.topics),
      weight: 2,
    });
  }

  // Tools (rendered as "Builds") — link out if the first link is external
  for (const t of tools) {
    const href = t.links?.[0]?.href ?? '/tools/';
    records.push({
      id: `tool:${slugify(t.id)}`,
      title: t.name,
      type: 'tool',
      typeLabel: 'Build',
      section: 'tools',
      accent: accentOf('tools'),
      url: href,
      external: isHttp(href),
      excerpt: cap(t.description),
      keywords: kw(t.tech, t.kind),
      weight: 2,
    });
  }

  // Cron
  for (const c of cronJobs) {
    records.push({
      id: `cron:${slugify(c.label)}`,
      title: c.label,
      type: 'cron',
      typeLabel: 'Cron',
      section: 'cron',
      accent: accentOf('cron'),
      url: '/cron/',
      external: false,
      excerpt: cap(c.purpose),
      keywords: kw(c.host, c.schedule),
      weight: 2,
    });
  }

  // Apps
  for (const g of appGroups) {
    for (const app of g.items) {
      const href = app.url ?? '/apps/';
      records.push({
        id: `app:${slugify(g.label)}-${slugify(app.name)}`,
        title: app.name,
        type: 'app',
        typeLabel: 'App',
        section: 'apps',
        accent: accentOf('apps'),
        url: href,
        external: isHttp(href),
        excerpt: cap(app.role),
        keywords: kw(g.label),
        weight: 2,
      });
    }
  }

  // Routines
  for (const g of routineGroups) {
    for (const r of g.items) {
      records.push({
        id: `routine:${slugify(g.label)}-${slugify(r.name)}`,
        title: r.name,
        type: 'routine',
        typeLabel: 'Routine',
        section: 'routines',
        accent: accentOf('routines'),
        url: '/routines/',
        external: false,
        excerpt: cap(r.purpose, 160),
        keywords: kw(r.trigger, r.channel, g.label),
        weight: 2,
      });
    }
  }

  // Stack — doctrine clauses
  for (const d of doctrineClauses) {
    records.push({
      id: `doctrine:${slugify(d.title)}`,
      title: d.title,
      type: 'doctrine',
      typeLabel: 'Doctrine',
      section: 'stack',
      accent: accentOf('stack'),
      url: '/stack/doctrine/',
      external: false,
      excerpt: cap(d.body, 160),
      keywords: '',
      weight: 2,
    });
  }

  // Stack — fable facets
  for (const f of fableFacets) {
    records.push({
      id: `fable:${slugify(f.title)}`,
      title: f.title,
      type: 'fable',
      typeLabel: 'Fable',
      section: 'stack',
      accent: accentOf('stack'),
      url: '/stack/fable/',
      external: false,
      excerpt: cap(f.body, 160),
      keywords: '',
      weight: 2,
    });
  }

  // Stack — hooks
  for (const h of hooks) {
    records.push({
      id: `hook:${slugify(h.name)}`,
      title: h.name,
      type: 'hook',
      typeLabel: 'Hook',
      section: 'stack',
      accent: accentOf('stack'),
      url: '/stack/hooks/',
      external: false,
      excerpt: cap(h.does, 160),
      keywords: kw(h.event, h.why),
      weight: 2,
    });
  }

  // Stack — status line rows
  for (const sr of statusRows) {
    records.push({
      id: `status:${slugify(sr.tag)}`,
      title: sr.tag,
      type: 'status',
      typeLabel: 'Status line',
      section: 'stack',
      accent: accentOf('stack'),
      url: '/stack/status-line/',
      external: false,
      excerpt: cap(sr.reads, 160),
      keywords: '',
      weight: 2,
    });
  }

  // Stack — sub-pages
  for (const p of stackPages) {
    records.push({
      id: `stack:${p.slug}`,
      title: p.title,
      type: 'stack',
      typeLabel: 'Stack',
      section: 'stack',
      accent: accentOf('stack'),
      url: `/stack/${p.slug}/`,
      external: false,
      excerpt: cap(p.blurb),
      keywords: '',
      weight: 2.5,
    });
  }

  // Jobs — external. applyUrl (role+company search), NOT j.url: the stored url is
  // deliberately degraded by the pipeline (ATS urls reduced to board roots, Adzuna
  // urls bounce through consumer sign-in) — same reason the /jobs/ cards use it.
  for (const j of jobs) {
    records.push({
      id: `job:${slugify(j.id)}`,
      title: j.title,
      type: 'job',
      typeLabel: 'Job',
      section: 'jobs',
      accent: accentOf('jobs'),
      url: applyUrl(j),
      external: true,
      excerpt: cap(j.why, 160),
      keywords: kw(j.company, j.location, j.flags),
      weight: 1.5,
    });
  }

  // Sections + special pages (Home, About, Résumé, Command Center, …)
  for (const s of SECTIONS) {
    const extra: unknown[] = [];
    if (s.slug === 'resume') {
      extra.push(
        resume.skills.flatMap((g) => g.items),
        resume.experience.flatMap((e) => [e.role, e.org]),
        resume.headline,
      );
    }
    records.push({
      id: `section:${s.slug || 'home'}`,
      title: s.title,
      type: 'section',
      typeLabel: 'Page',
      section: s.slug,
      accent: s.accent ?? 'accent',
      url: s.slug === '' ? '/' : `/${s.slug}/`,
      external: false,
      excerpt: cap(s.description),
      keywords: kw(s.navLabel, s.dataSource, ...extra),
      weight: 2.5,
    });
  }

  return new Response(JSON.stringify(records), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
