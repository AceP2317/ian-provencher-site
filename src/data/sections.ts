// ============================================================================
// The section registry — the site's spine.
//
// Every navigational surface reads from SECTIONS: the header nav, the landing
// grid, and (via src/pages/[section]/index.astro) an auto-generated "in build"
// page for every section that is not yet live.
//
// TO ADD A SECTION:  add one entry here. It gets a nav slot + a landing card +
//                    a real stub page for free.
// TO TAKE IT LIVE:   add src/pages/<slug>/index.astro (a static route beats the
//                    catch-all), flip status to 'live', wire its data source.
//
// ORDER is a pure sort key (nav + landing grid both read it). Keep the array in
// `order` sequence so the file reads top-to-bottom like the nav; renumber freely.
// ============================================================================

/** Drives the badge + whether the landing card links or sits dimmed. */
export type SectionStatus = 'live' | 'stub' | 'planned';

/** Decides the render pipeline (documentation only; no runtime branch here). */
export type SectionKind =
  | 'collection' // zod-schema'd markdown (blog, news, favorites)
  | 'data'       // build-time JSON from an external feed (repos, tools, cron, apps, architectures)
  | 'special';   // bespoke page (home, command-center)

export interface Section {
  /** URL segment + registry key; kebab-case; '' = home. */
  slug: string;
  title: string;
  /** Short nav label (defaults to title). */
  navLabel?: string;
  /** Lucide icon name — resolved by src/components/Icon.astro. */
  icon: string;
  /** Landing-card blurb + <meta> description. */
  description: string;
  status: SectionStatus;
  kind: SectionKind;
  /** Human note on where the section's content comes from. */
  dataSource: string;
  /** Default true; home stays off the nav. */
  inNav?: boolean;
  /** Landing-grid + nav order. */
  order: number;
  /** Per-section accent token override (else the global amber accent). */
  accent?: 'accent' | 'cyan' | 'indigo' | 'green';
}

export const SECTIONS: Section[] = [
  {
    slug: '', title: 'Home', navLabel: 'Home', icon: 'home', order: 0,
    inNav: false, status: 'live', kind: 'special',
    description: 'Ian Provencher — builder.', dataSource: '—',
  },
  {
    slug: 'about', title: 'About', icon: 'user-round', order: 1,
    status: 'live', kind: 'special',
    description: 'Who I am — a supply-chain operator who builds the operational software big systems leave out, full-stack and AI-forward.',
    dataSource: '—',
  },
  {
    slug: 'resume', title: 'Resume', icon: 'file-text', order: 2,
    status: 'live', kind: 'special',
    description: 'The living resume — what I’ve done and what I build, always current.',
    dataSource: 'hand-authored data/resume (public-safe)',
  },
  {
    slug: 'podcast', title: 'Podcast', icon: 'podcast', order: 3,
    status: 'live', kind: 'collection', accent: 'cyan',
    description: 'AI From the Floor — a daily AI news show, read through an operator’s lens.',
    dataSource: 'content/podcast (synced from episode releases)',
  },
  {
    slug: 'jobs', title: 'Job Board', navLabel: 'Jobs', icon: 'briefcase', order: 4,
    status: 'live', kind: 'data', accent: 'green',
    description: 'Roles worth a look — pulled, scored against what I want, and linked out.',
    dataSource: 'job-aggregator API + AI scoring (public-safe export)',
  },
  {
    slug: 'architectures', title: 'Architectures', navLabel: 'Arch', icon: 'network', order: 5,
    status: 'live', kind: 'data', accent: 'cyan',
    description: 'Interactive diagrams of the systems I run.',
    dataSource: 'Command Center OS · data/architectures (public-safe export)',
  },
  {
    slug: 'claude-setup', title: 'Claude Setup', navLabel: 'Claude Setup', icon: 'terminal', order: 6,
    status: 'live', kind: 'special', accent: 'cyan',
    description: 'A 3D walkthrough of my entire Claude setup — every layer of the workflow, and why it’s wired the way it is.',
    dataSource: 'hand-authored data/claude-code-setup (public-safe)',
  },
  {
    slug: 'command-center', title: 'Command Center', navLabel: 'Center', icon: 'radar', order: 7,
    status: 'live', kind: 'special', accent: 'cyan',
    description: 'A public-safe window into the ops console I run everything from.',
    dataSource: 'Command Center OS (reviewed public snapshot)',
  },
  {
    slug: 'tools', title: 'Builds', navLabel: 'Builds', icon: 'wrench', order: 8,
    status: 'live', kind: 'data',
    description: 'Full-stack apps and operational tools I’ve built and shipped.',
    dataSource: 'Command Center OS · data/tools (public-safe export)',
  },
  {
    slug: 'repos', title: 'Repositories', navLabel: 'Repos', icon: 'git-branch', order: 9,
    status: 'live', kind: 'data',
    description: 'A visual gallery of what I build in the open.',
    dataSource: 'GitHub API (AceP2317, public repos)',
  },
  {
    slug: 'stack', title: 'Operating Stack', navLabel: 'Stack', icon: 'layers', order: 10,
    status: 'live', kind: 'special', accent: 'cyan',
    description: 'How I direct AI — the operating doctrine, the execution register, the hooks that wire it together, and the live status-line instrument.',
    dataSource: 'hand-authored data/stack (public-safe)',
  },
  {
    slug: 'cron', title: 'Cron jobs', navLabel: 'Cron', icon: 'timer', order: 11,
    status: 'live', kind: 'data', accent: 'indigo',
    description: 'The scheduled machinery that runs itself.',
    dataSource: 'Hermes · model.public.json + hand-authored (public-safe)',
  },
  {
    slug: 'routines', title: 'Routines', icon: 'bell-ring', order: 12,
    status: 'live', kind: 'data', accent: 'indigo',
    description: 'The notification routines that keep me in the loop — what they watch and why.',
    dataSource: 'hand-authored data/routines (public-safe)',
  },
  {
    slug: 'apps', title: 'Apps & workflows', navLabel: 'Apps', icon: 'layout-grid', order: 13,
    status: 'live', kind: 'data', accent: 'green',
    description: 'The apps I lean on — and how I actually wire them together.',
    dataSource: 'hand-authored data/apps',
  },
  {
    slug: 'favorites', title: 'Favorites', navLabel: 'Faves', icon: 'bookmark', order: 14,
    status: 'live', kind: 'collection',
    description: 'A visual bookmarks board — categorized and grouped.',
    dataSource: 'content/favorites',
  },
  {
    slug: 'anthropic', title: 'Anthropic', icon: 'sparkles', order: 15,
    status: 'live', kind: 'data', accent: 'indigo',
    description: 'Everything Anthropic publishes, in one place — docs, courses, certifications, tools, research — plus the best third-party resources.',
    dataSource: 'hand-authored data/anthropic (public-safe)',
  },
  {
    slug: 'blog', title: 'Blog', icon: 'pen-line', order: 16,
    status: 'live', kind: 'collection',
    description: 'Field notes — authored and dragged in.',
    dataSource: 'content/blog',
  },
  {
    slug: 'news', title: 'Signal', icon: 'newspaper', order: 17,
    status: 'live', kind: 'collection',
    description: 'Articles worth pinning, with why-it-matters.',
    dataSource: 'content/news',
  },
  {
    slug: 'tips', title: 'Tips & Tricks', navLabel: 'Tips', icon: 'lightbulb', order: 18,
    status: 'live', kind: 'collection',
    description: 'The small optimizations, workflows, and settings I use day to day.',
    dataSource: 'content/tips',
  },
  {
    slug: 'glossary', title: 'Glossary', icon: 'brain', order: 19,
    status: 'live', kind: 'data', accent: 'indigo',
    description: 'A working technical dictionary — AI, software, the web, data, infrastructure, security, systems, and supply chain, defined plainly and grouped by field.',
    dataSource: 'hand-authored data/glossary (public-safe)',
  },
  {
    slug: 'learn', title: 'Learn', icon: 'graduation-cap', order: 20,
    status: 'live', kind: 'data', accent: 'green',
    description: 'Crash courses at your level — a short primer on each topic plus the 2-3 best resources to go further, tuned to where you’re starting from.',
    dataSource: 'hand-authored data/learn (public-safe)',
  },
];

// ── derived helpers (import these; never re-filter inline) ──────────────────
export const bySlug = new Map(SECTIONS.map((s) => [s.slug, s]));

export const navSections = SECTIONS
  .filter((s) => s.inNav !== false)
  .sort((a, b) => a.order - b.order);

export const gridSections = SECTIONS
  .filter((s) => s.slug !== '')
  .sort((a, b) => a.order - b.order);

/** Slugs the catch-all owns — every section not given an explicit live route. */
export const stubSlugs = SECTIONS
  .filter((s) => s.status !== 'live' && s.slug !== '')
  .map((s) => s.slug);

/** Human-facing badge label for a status. */
export const statusLabel: Record<SectionStatus, string> = {
  live: 'Live',
  stub: 'In build',
  planned: 'Planned',
};
