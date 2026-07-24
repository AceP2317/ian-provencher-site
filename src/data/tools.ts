// Typed loader over the committed public-safe snapshot (scripts/export-public.mjs).
import data from './tools.generated.json';

export type ToolKind = 'internal-tool' | 'demo' | 'web-app' | 'app' | 'cli' | 'skill-suite' | 'site';
export type ToolStatus = 'deployed' | 'shippable' | 'wip';

export interface Tool {
  id: string; name: string; kind: ToolKind; status: ToolStatus;
  tech: string; description: string;
  links: { label: string; href: string }[];
}

export const tools = data as Tool[];

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
};

/** Group tools by kind, in a stable display order. */
export function toolsByKind(): { kind: ToolKind; label: string; items: Tool[] }[] {
  // Console + apps lead; the demo gallery follows.
  const order: ToolKind[] = ['internal-tool', 'app', 'cli', 'web-app', 'site', 'demo', 'skill-suite'];
  return order
    .map((kind) => ({ kind, label: KIND_LABEL[kind], items: tools.filter((t) => t.kind === kind) }))
    .filter((g) => g.items.length > 0);
}
