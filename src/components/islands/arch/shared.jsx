// Shared architecture-viewer internals — one controller + pure helpers, used by
// the 2D SVG scene, the 3D r3f scene, and the inspector shell. Keeping the state
// machine here means both scenes stay in perfect sync and the inspector/walkthrough
// UX is written once.
import { useMemo, useState } from 'react';
import { KIND_META } from '../../../data/arch-kinds';

export const HW = 92; // node half-width (2D)
export const HH = 34; // node half-height (2D)
export const S = 10;  // coordinate scale (0–100 → 0–1000)

// 2D type sizes. These are SVG USER UNITS inside a ~1000-unit viewBox — NOT CSS px, and
// deliberately NOT one of the --fs-* rem tokens: a 0.75rem token here would render the
// label at 12/1000 of the diagram's width and be invisible. Named here so they sit beside
// the rest of the diagram geometry rather than as magic numbers in the markup.
export const FS_LABEL = 19;
export const FS_SUB = 10.5;
export const FS_EDGE = 10;

// The ONE flow palette. Both scenes read it — 2D tints its edges + pulses straight from
// these `var()` strings; 3D resolves them to hex at mount (WebGL can't read var()). Two
// copies of this map is how the two scenes drift into telling different stories.
export const FLOW_COLOR = {
  data: 'var(--color-cyan)',
  control: 'var(--color-accent)',
  // Violet, matching the `agent` kind — events are agent-emitted. Never green: see below.
  event: 'var(--color-violet)',
};

export const KIND_COLOR = Object.fromEntries(Object.entries(KIND_META).map(([k, v]) => [k, v.color]));
export const KIND_LABEL = Object.fromEntries(Object.entries(KIND_META).map(([k, v]) => [k, v.label]));
// Kind order → depth plane in 3D (front-to-back along the flow of work).
export const KIND_ORDER = Object.keys(KIND_META);

export const edgeKey = (e) => `${e.from}->${e.to}`;

/**
 * Longest-path rank of every node from a source (a node with no incoming edges), by
 * Kahn's algorithm.
 *
 * WHY: the 3D scene used to place nodes on a depth plane derived purely from their KIND
 * (`kindZ`), so every node of the same kind sat at an identical z. In `arch-command-center`
 * both engines were coplanar; across all six architectures, 36 nodes collapsed onto six
 * discrete slices. Combined with x/y that were hand-tuned for the 2D diagram, the 3D view
 * was literally "the SVG, tilted" — six flat parallel sheets rather than a system in space.
 *
 * Rank gives each node a position in the actual FLOW of the graph, so two engines that do
 * different jobs at different stages no longer sit on top of each other. The kind plane is
 * still the base (operator → surface → engine → agent → store → external is genuinely
 * semantic); rank spreads nodes WITHIN it.
 *
 * Any node caught in a cycle is never dequeued and keeps rank 0, which is a safe floor —
 * these graphs are small, near-DAG pipelines.
 *
 * ponytail: the honest fix is populating the `z` field that already exists in the schema
 * (it is `null` on all 36 nodes today) from the private Command Center OS records and
 * re-running `npm run publish:data`. That needs the operator's machine (D2). This derives
 * a good layout from the graph we already have, and `nodePos` still prefers an explicit
 * `z` the moment one lands.
 */
export function topoRanks(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n.id, []]));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));

  for (const e of edges) {
    if (!adj.has(e.from) || !indeg.has(e.to)) continue;
    adj.get(e.from).push(e.to);
    indeg.set(e.to, indeg.get(e.to) + 1);
  }

  const rank = new Map(nodes.map((n) => [n.id, 0]));
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);

  while (queue.length) {
    const id = queue.shift();
    for (const to of adj.get(id)) {
      rank.set(to, Math.max(rank.get(to), rank.get(id) + 1));
      indeg.set(to, indeg.get(to) - 1);
      if (indeg.get(to) === 0) queue.push(to);
    }
  }
  return rank;
}

/**
 * The semantic class of an edge, which drives its colour and its packet colour.
 *
 * The schema HAS a `flow` field ('data' | 'control' | 'event') and the 3D scene already
 * had a colour for each — but it is `null` on all 34 edges in the published snapshot, so
 * every packet fell through to the same cyan and the colour-coding was dead code.
 *
 * ponytail: heuristic, inferred from the kinds at each end. The real fix is authoring
 * `flow` in the private CCOS records (operator's machine, D2). An explicit value always
 * wins here, so the moment the data lands this inference stops being consulted.
 */
export function inferFlow(edge, nodeById) {
  if (edge.flow) return edge.flow;

  const from = nodeById.get(edge.from);
  const to = nodeById.get(edge.to);
  if (!from || !to) return 'data';

  // ORDER IS LOAD-BEARING, and it is a colour decision as much as a semantic one.
  //
  // Checking `agent` first looks reasonable and is wrong: an agent (Claude Code, the
  // nightly sweeper) touches most edges in these graphs, so nearly every edge resolves to
  // 'event' — and a single class would then paint most of the diagram, which is a lie
  // about what the system actually carries. The rank order below is what keeps 'event'
  // rare enough to MEAN something when you see it.
  //
  // (Historical note: 'event' used to be GREEN, and the flood was doubly bad — green on
  // this site is STATE, live / healthy / on-target, and the moment it becomes decorative
  // every genuine status signal stops meaning anything. Event is now violet, matching the
  // `agent` kind that emits it. The ordering below is kept regardless: it was always the
  // truer question.)
  //
  // Asking what the edge CARRIES rather than who is standing at its ends:

  // …touching a store, the payload is state. Cyan — the analytics charge, and the site's
  // dominant secondary. This is correctly the common case.
  if (from.kind === 'store' || to.kind === 'store') return 'data';

  // …touching the human, the payload is direction. Amber — the primary accent.
  if (from.kind === 'operator' || to.kind === 'operator') return 'control';

  // …an agent firing at something that is not a store. A genuine event — violet, the
  // agent kind's own hue, and rare enough that it still reads as an exception.
  if (from.kind === 'agent' || to.kind === 'agent') return 'event';

  return 'data';
}

// Point on `from`'s box edge pointing toward `to` (so 2D lines meet box borders).
export function edgePoint(from, to) {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  if (dx === 0 && dy === 0) return { x: from.cx, y: from.cy };
  const s = Math.min(
    Math.abs(dx) < 1e-6 ? Infinity : HW / Math.abs(dx),
    Math.abs(dy) < 1e-6 ? Infinity : HH / Math.abs(dy),
  );
  return { x: from.cx + dx * s, y: from.cy + dy * s };
}

// Minimal inline formatter: **bold** and `code`.
export function inline(str) {
  const parts = String(str).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p)) return <code key={i} className="arch-code">{p.slice(1, -1)}</code>;
    return p;
  });
}
export function Rich({ text }) {
  const paras = String(text || '').split(/\n\n+/);
  return paras.map((p, i) => (
    <p key={i} style={{ margin: i === 0 ? '0 0 0.75em' : '0.75em 0' }}>{inline(p)}</p>
  ));
}

// The one state machine: step (walkthrough), selected node, selected edge — plus
// all the derived lookups both scenes need.
export function useArchController(arch) {
  const [step, setStep] = useState(-1); // -1 = overview
  const [selected, setSelected] = useState(null); // node id
  const [selEdge, setSelEdge] = useState(null); // edge key

  const nodeById = useMemo(() => {
    const m = new Map();
    for (const n of arch.nodes) m.set(n.id, { ...n, cx: n.x * S, cy: n.y * S });
    return m;
  }, [arch]);

  const view = useMemo(() => {
    const cxs = [...nodeById.values()].map((n) => n.cx);
    const cys = [...nodeById.values()].map((n) => n.cy);
    const pad = 24;
    const minX = Math.min(...cxs) - HW - pad;
    const minY = Math.min(...cys) - HH - pad;
    const maxX = Math.max(...cxs) + HW + pad;
    const maxY = Math.max(...cys) + HH + pad;
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  }, [nodeById]);

  const active = useMemo(() => {
    if (step < 0) return null;
    const st = arch.walkthrough[step];
    return { nodes: new Set(st.nodes), edges: new Set(st.edges.map(edgeKey)) };
  }, [step, arch]);

  const nodeOn = (id) => !active || active.nodes.has(id);
  const edgeOn = (e) => !active || active.edges.has(edgeKey(e));

  const selectNode = (id) => { setSelected((cur) => (cur === id ? null : id)); setSelEdge(null); };
  const selectEdge = (k) => { setSelEdge((cur) => (cur === k ? null : k)); setSelected(null); };
  const clearSel = () => { setSelected(null); setSelEdge(null); };
  const goStep = (s) => { setStep(s); clearSel(); };

  const sel = selected ? nodeById.get(selected) : null;
  const selEdgeObj = selEdge ? arch.edges.find((e) => edgeKey(e) === selEdge) : null;
  const hasWalk = arch.walkthrough && arch.walkthrough.length > 0;

  return {
    arch, step, selected, selEdge, nodeById, view, active,
    nodeOn, edgeOn, selectNode, selectEdge, clearSel, goStep,
    sel, selEdgeObj, hasWalk,
  };
}
