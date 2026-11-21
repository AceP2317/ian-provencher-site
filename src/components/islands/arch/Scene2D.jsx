// The 2D SVG scene — the original hand-laid diagram, now driven by the shared
// controller. It is the SSR output (so crawlers + no-JS see the diagram) and the
// fallback whenever 3D isn't available. Edges are now selectable too.
//
// This is the scene MOST people see: it is the server render, the crawler view, the no-JS
// view, and the default on every coarse-pointer device under 900px. Everything visual it
// does therefore lives in CSS CLASSES rather than inline styles — an inline style can
// never be reached by an `@media` rule, so a reduced-motion or coarse-pointer visitor
// could not opt out of anything expressed inline, and with JS off a `reduced` prop would
// not exist at all. Per-node colour is the one exception: it is data, and it arrives as a
// single inline custom property (`--k`) that the CSS then keys every state off.
import {
  HW, HH, KIND_COLOR, FLOW_COLOR, FS_LABEL, FS_SUB, FS_EDGE,
  edgePoint, edgeKey, inferFlow,
} from './shared.jsx';

export default function Scene2D({ c }) {
  const { arch, nodeById, view, selected, selEdge, nodeOn, edgeOn, selectNode, selectEdge } = c;

  return (
    <div className="arch-canvas panel">
      <svg
        viewBox={`${view.minX} ${view.minY} ${view.w} ${view.h}`}
        role="img"
        aria-label={`${arch.title} architecture diagram`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <defs>
          <marker id={`arw-${arch.id}`} viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--color-ink-faint)" />
          </marker>
        </defs>

        {/* edges */}
        {arch.edges.map((e, i) => {
          const a = nodeById.get(e.from);
          const b = nodeById.get(e.to);
          if (!a || !b) return null;
          const p1 = edgePoint(a, b);
          const p2 = edgePoint(b, a);
          const on = edgeOn(e);
          const k = edgeKey(e);
          const isSel = selEdge === k;
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          const clickable = !!(e.detail || e.label);
          // The SAME semantic call the 3D scene makes, from the same helper — so both scenes
          // tell one story about what each connection carries instead of two.
          const flow = inferFlow(e, nodeById);
          return (
            <g
              key={i}
              className={[
                'arch-edge',
                on ? '' : 'is-off',
                isSel ? 'is-sel' : '',
                clickable ? 'is-link' : '',
              ].filter(Boolean).join(' ')}
              style={{ '--k': FLOW_COLOR[flow] || 'var(--color-ink-faint)' }}
              onClick={clickable ? () => selectEdge(k) : undefined}
              onKeyDown={clickable ? (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectEdge(k); } } : undefined}
              tabIndex={clickable ? 0 : undefined}
              role={clickable ? 'button' : undefined}
              aria-pressed={clickable ? isSel : undefined}
              aria-label={clickable ? `${e.from} to ${e.to}${e.detail ? ' — details' : ''}` : undefined}
            >
              {/* wide invisible hit line for easy clicking */}
              {clickable && <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth="12" />}
              <line
                className="arch-edge-line"
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                markerEnd={`url(#arw-${arch.id})`}
              />
              {/* The travelling pulse. NOT a new mechanism: `.pf-syn` is the exact primitive
                  PipelineFlow already ships on the homepage and on this section's own index —
                  pathLength=100 + a one-dash stroke-dasharray, already opacity-0 and static
                  under reduced motion. Only `on` edges get one: stroke-dashoffset REPAINTS
                  (it is not compositor-accelerated), so the count is bounded to the edges the
                  current walkthrough step is actually about. */}
              {on && (
                <line
                  className="pf-syn"
                  x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  pathLength="100"
                  strokeWidth="4"
                  style={{ stroke: 'var(--k)', animationDelay: `${-0.55 * i}s` }}
                />
              )}
              {e.label && (
                <g>
                  <rect x={mx - e.label.length * 3.1 - 3} y={my - 8} width={e.label.length * 6.2 + 6}
                    height="15" rx="3" fill="var(--color-canvas)" opacity="0.92" />
                  <text className="arch-edge-label" x={mx} y={my + 3} textAnchor="middle"
                    fontFamily="var(--font-mono)" fontSize={FS_EDGE}>
                    {e.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* nodes */}
        {[...nodeById.values()].map((n) => {
          const on = nodeOn(n.id);
          const isSel = selected === n.id;
          const color = KIND_COLOR[n.kind] || 'var(--color-ink-faint)';
          return (
            /* The `transform` ATTRIBUTE below is the node's position and is load-bearing.
               The hover lift is therefore expressed with the independent `translate`
               property in CSS (never `transform`), which composes with it — a CSS
               `transform` would REPLACE it and fling every node to the origin. */
            <g
              key={n.id}
              transform={`translate(${n.cx} ${n.cy})`}
              className={`arch-node ${on ? '' : 'is-off'} ${isSel ? 'is-sel' : ''}`}
              style={{ '--k': color }}
              onClick={() => selectNode(n.id)}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectNode(n.id); } }}
              tabIndex={0}
              role="button"
              aria-pressed={isSel}
              aria-label={`${n.label}${n.detail ? ' — details' : ''}`}
            >
              <rect className="arch-node-box" x={-HW} y={-HH} width={HW * 2} height={HH * 2} rx="10" />
              <circle className="arch-node-dot" cx={-HW + 13} cy={-HH + 13} r="4" />
              <text x="0" y={n.sublabel ? -4 : 6} textAnchor="middle"
                fontFamily="var(--font-display)" fontSize={FS_LABEL} fontWeight="600"
                fill="var(--color-ink)">{n.label}</text>
              {n.sublabel && (
                <text x="0" y="16" textAnchor="middle"
                  fontFamily="var(--font-mono)" fontSize={FS_SUB} fill="var(--color-ink-muted)">
                  {n.sublabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
