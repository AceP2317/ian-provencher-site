// Node-kind taxonomy for architecture diagrams — the SINGLE source of truth for
// both the SVG viewer (islands/ArchitectureViewer.jsx) and the legend + loader
// (architectures.ts). Kept data-free (only token strings) so importing it into
// the client island adds no diagram data to the bundle.
export type NodeKind = 'operator' | 'surface' | 'engine' | 'agent' | 'store' | 'external';

/** Human label + the design token each node kind renders in. */
export const KIND_META: Record<NodeKind, { label: string; color: string }> = {
  operator: { label: 'Operator', color: 'var(--color-accent)' },
  surface: { label: 'Surface', color: 'var(--color-cyan)' },
  engine: { label: 'Engine', color: 'var(--color-indigo)' },
  // Violet, NOT green. Green (and red) are STATE on this site — live / healthy / failing.
  // A node KIND is a taxonomy, never a state, so a kind may not spend green: the moment
  // green is decorative, every real health signal on the surface stops meaning anything.
  // Violet keeps the hue budget closed too — it is the top of the existing indigo ramp,
  // not a sixth decorative hue. (docs: Command_Center_OS arch-design-language.md)
  agent: { label: 'Agent', color: 'var(--color-violet)' },
  store: { label: 'Store', color: 'var(--color-label)' },
  external: { label: 'External', color: 'var(--color-ink-faint)' },
};
