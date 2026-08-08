/**
 * Anthropic resource board — the derived layer over src/data/anthropic-resources.json,
 * a curated, VERIFIED catalog of the resources Anthropic publishes directly
 * (first-party) plus a tight set of the most reputable third-party resources.
 * Modeled on the favorites board (src/data/favorites.ts): grouped, filterable link
 * cards — but split into two tiers (from-Anthropic vs. reputable third-party).
 *
 * PUBLIC-SAFE: all public URLs; the build-time safety gate is the backstop.
 */
import rawResources from './anthropic-resources.json';

/** Resource-type columns, in canonical display order. */
export const ANTHROPIC_CATEGORIES = [
  'docs', 'courses', 'certification', 'cookbook', 'tools', 'research', 'news', 'support', 'community',
] as const;
export type AnthropicCategory = (typeof ANTHROPIC_CATEGORIES)[number];

export type AnthropicTier = 'first-party' | 'third-party';

export const CATEGORY_META: Record<AnthropicCategory, { label: string; icon: string; accent: string }> = {
  docs: { label: 'Docs & API reference', icon: 'newspaper', accent: 'var(--color-cyan)' },
  courses: { label: 'Courses & learning', icon: 'graduation-cap', accent: 'var(--color-green)' },
  certification: { label: 'Certification', icon: 'file-text', accent: 'var(--color-accent)' },
  cookbook: { label: 'Cookbook & SDKs', icon: 'code', accent: 'var(--color-indigo)' },
  tools: { label: 'Tools & apps', icon: 'wrench', accent: 'var(--color-accent)' },
  research: { label: 'Research & safety', icon: 'brain', accent: 'var(--color-violet)' },
  news: { label: 'News & blog', icon: 'pen-line', accent: 'var(--color-label)' },
  support: { label: 'Support & policies', icon: 'shield', accent: 'var(--color-rose)' },
  community: { label: 'Community', icon: 'radar', accent: 'var(--color-cyan-deep)' },
};

export interface AnthropicResource {
  title: string;
  url: string;
  category: AnthropicCategory;
  tier: AnthropicTier;
  description?: string;
  tags: string[];
  order: number;
}

export interface RawResource {
  title: string;
  url: string;
  category: string;
  tier?: string;
  description?: string;
  tags?: string[];
  order?: number;
}

const CATSET = new Set<string>(ANTHROPIC_CATEGORIES);

/** Load → validate url + category → dedupe by url → normalize. */
export function buildResources(raw: RawResource[]): AnthropicResource[] {
  const out: AnthropicResource[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const title = String(r?.title || '').trim();
    const url = String(r?.url || '').trim();
    if (!title || !/^https?:\/\//.test(url) || !CATSET.has(r.category)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      title,
      url,
      category: r.category as AnthropicCategory,
      tier: r.tier === 'third-party' ? 'third-party' : 'first-party',
      description: r.description ? String(r.description).trim() : undefined,
      tags: Array.isArray(r.tags) ? r.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [],
      order: Number.isFinite(r.order) ? Number(r.order) : 0,
    });
  }
  return out;
}

export const anthropicResources: AnthropicResource[] = buildResources(rawResources as unknown as RawResource[]);

/** Group a tier's resources by category (canonical order), each sorted by order then title. */
function groupByCategory(items: AnthropicResource[]) {
  return ANTHROPIC_CATEGORIES
    .map((category) => ({
      category,
      meta: CATEGORY_META[category],
      items: items
        .filter((r) => r.category === category)
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    }))
    .filter((g) => g.items.length > 0);
}

/** The two macro-sections: from-Anthropic first, then reputable third-party. */
export function anthropicByTier() {
  return [
    { tier: 'first-party' as const, label: 'From Anthropic', groups: groupByCategory(anthropicResources.filter((r) => r.tier === 'first-party')) },
    { tier: 'third-party' as const, label: 'Reputable third-party', groups: groupByCategory(anthropicResources.filter((r) => r.tier === 'third-party')) },
  ].filter((t) => t.groups.length > 0);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
