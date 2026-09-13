// Typed loader over the committed public-safe snapshot (scripts/export-public.mjs).
import data from './architectures.generated.json';
import { type NodeKind, KIND_META } from './arch-kinds';

// Re-export so existing importers (`../../data/architectures`) keep working.
export { KIND_META };
export type { NodeKind };

export interface ArchNode {
  id: string; label: string; sublabel: string | null;
  kind: NodeKind; x: number; y: number; detail: string | null;
  /** Optional 3D-viewer enrichment (all back-compat; absent → derived). */
  z?: number | null;         // explicit depth; else layered by kind
  group?: string | null;     // subsystem tag
  weight?: number | null;    // importance → node scale/emphasis
}
export interface ArchEdge {
  from: string; to: string; label: string | null; detail: string | null;
  /** Packet style for the 3D data-flow animation. */
  flow?: 'data' | 'control' | 'event' | null;
}
export interface ArchStep { title: string; body: string; nodes: string[]; edges: { from: string; to: string }[]; }
export interface Architecture {
  id: string; title: string; tagline: string; story: string;
  nodes: ArchNode[]; edges: ArchEdge[]; walkthrough: ArchStep[];
}

export const architectures = data as Architecture[];
export const getArchitecture = (id: string) => architectures.find((a) => a.id === id);

/** Public URL slug for an architecture (drops the `arch-` id prefix). */
export const archSlug = (id: string) => id.replace(/^arch-/, '');

/**
 * Page-level JSON-LD for an architecture detail page: a CreativeWork authored by
 * the site Person + a BreadcrumbList. Mirrors postSchema() in blog.ts.
 */
export function archSchema(arch: Architecture, origin: string): Record<string, unknown>[] {
  const url = `${origin}/architectures/${archSlug(arch.id)}/`;
  return [
    {
      '@type': 'CreativeWork',
      '@id': `${url}#creativework`,
      name: arch.title,
      description: arch.tagline,
      url,
      author: { '@id': `${origin}/#person` },
      isPartOf: { '@id': `${origin}/#website` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Architectures', item: `${origin}/architectures/` },
        { '@type': 'ListItem', position: 3, name: arch.title, item: url },
      ],
    },
  ];
}
