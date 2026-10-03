// Typed loader over the committed public-safe snapshot (scripts/export-public.mjs).
import data from './tools.generated.json';

export type ToolKind = 'internal-tool' | 'demo' | 'web-app' | 'app' | 'cli' | 'skill-suite' | 'site';
export type ToolStatus = 'deployed' | 'shippable' | 'wip' | 'retired';

export interface Tool {
  id: string; name: string; kind: ToolKind; status: ToolStatus;
  tech: string; description: string;
  links: { label: string; href: string }[];
  /** Set only on a retired build: the day it stopped, and a one-line public reason. */
  retiredOn?: string | null;
  retiredWhy?: string | null;
}

export const tools = data as Tool[];
/** Builds that are still running. Anything that claims what "I run" counts these only. */
export const liveTools = tools.filter((t) => t.status !== 'retired');
export const retiredTools = tools.filter((t) => t.status === 'retired');

export const KIND_LABEL: Record<ToolKind, string> = {
  'internal-tool': 'Internal tool',
  demo: 'Live demo',
  'web-app': 'Web app',
  app: 'Desktop & mobile app',
  cli: 'CLI & library',
  'skill-suite': 'Skill suite',
  site: 'Site',
};

export const STATUS_META: Record<ToolStatus, { label: string; color: string }> = {
  deployed: { label: 'Deployed', color: 'var(--color-up)' },
  shippable: { label: 'Shippable', color: 'var(--color-cyan)' },
  wip: { label: 'WIP', color: 'var(--color-warn)' },
  // Rendered by its own dimmed chip (the Stack page's retired treatment), never this colour
  // on its own; the entry exists so every status has a label.
  retired: { label: 'Retired', color: 'var(--color-ink-faint)' },
};

/** Group tools by kind, in a stable display order. */
export function toolsByKind(): { kind: ToolKind; label: string; items: Tool[] }[] {
  // Console + apps lead; the demo gallery follows.
  const order: ToolKind[] = ['internal-tool', 'app', 'cli', 'web-app', 'site', 'demo', 'skill-suite'];
  return order
    // Retired builds stay in their group but sort last, so the group leads with what runs.
    .map((kind) => ({
      kind,
      label: KIND_LABEL[kind],
      items: tools
        .filter((t) => t.kind === kind)
        .sort((a, b) => Number(a.status === 'retired') - Number(b.status === 'retired')),
    }))
    .filter((g) => g.items.length > 0);
}
