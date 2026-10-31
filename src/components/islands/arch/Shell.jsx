// The inspector panel + walkthrough controls — shared by the 2D and 3D scenes.
// Shows node detail, edge detail, the current step, or the overview.
import { KIND_COLOR, KIND_LABEL, Rich } from './shared.jsx';

export default function Shell({ c }) {
  const { arch, step, goStep, clearSel, sel, selEdgeObj, hasWalk } = c;

  return (
    <>
      <aside className="arch-panel panel">
        {sel ? (
          <div>
            <div className="arch-kind" style={{ color: KIND_COLOR[sel.kind] }}>
              <span className="arch-kind-dot" style={{ background: KIND_COLOR[sel.kind] }} />
              {KIND_LABEL[sel.kind]}
              {sel.group && <span style={{ marginLeft: 8, color: 'var(--color-ink-faint)' }}>· {sel.group}</span>}
            </div>
            <h2 className="arch-h">{sel.label}</h2>
            {sel.sublabel && <p className="arch-sub">{sel.sublabel}</p>}
            <div className="arch-body">
              {sel.detail ? <Rich text={sel.detail} /> : <p>No further detail.</p>}
            </div>
            {/* `link-sweep`, never `.lift`: this is inline text, and translating a word
                inside a block shoves the line and reads as a rendering bug. The sweep is the
                site's existing primitive for exactly this case. */}
            <button className="arch-clear link-sweep" onClick={clearSel}>← back to walkthrough</button>
          </div>
        ) : selEdgeObj ? (
          <div>
            <div className="arch-kind" style={{ color: 'var(--color-cyan)' }}>
              <span className="arch-kind-dot" style={{ background: 'var(--color-cyan)' }} />
              Connection
            </div>
            <h2 className="arch-h">{selEdgeObj.label || `${selEdgeObj.from} → ${selEdgeObj.to}`}</h2>
            <p className="arch-sub">{selEdgeObj.from} → {selEdgeObj.to}</p>
            <div className="arch-body">
              {selEdgeObj.detail ? <Rich text={selEdgeObj.detail} /> : <p>No further detail on this connection.</p>}
            </div>
            {/* `link-sweep`, never `.lift`: this is inline text, and translating a word
                inside a block shoves the line and reads as a rendering bug. The sweep is the
                site's existing primitive for exactly this case. */}
            <button className="arch-clear link-sweep" onClick={clearSel}>← back to walkthrough</button>
          </div>
        ) : step >= 0 ? (
          <div>
            <div className="arch-kind" style={{ color: 'var(--color-cyan-deep)' }}>
              Step {step + 1} of {arch.walkthrough.length}
            </div>
            <h2 className="arch-h">{arch.walkthrough[step].title}</h2>
            <div className="arch-body"><Rich text={arch.walkthrough[step].body} /></div>
          </div>
        ) : (
          <div>
            <div className="arch-kind" style={{ color: 'var(--color-label)' }}>Overview</div>
            <h2 className="arch-h">{arch.title}</h2>
            <p className="arch-sub" style={{ marginBottom: '0.75rem' }}>{arch.tagline}</p>
            <div className="arch-body"><Rich text={arch.story} /></div>
          </div>
        )}
      </aside>

      {hasWalk && (
        <div className="arch-controls">
          <button
            className="btn btn-secondary arch-btn"
            onClick={() => goStep(Math.max(-1, step - 1))}
            disabled={step < 0}
          >← Prev</button>
          {/* Same move as .arch-mode: the step pills adopt `btn btn-secondary` (the site's
              one interaction system — press state, ring, sheen, tokenized transitions) and
              `.arch-dot` is reduced to the pill's size/shape/state on top of it. */}
          <div className="arch-dots">
            <button
              className={`btn btn-secondary arch-dot ${step < 0 ? 'is-on' : ''}`}
              onClick={() => goStep(-1)}
              aria-label="Overview"
            >Overview</button>
            {arch.walkthrough.map((_, i) => (
              <button
                key={i}
                className={`btn btn-secondary arch-dot arch-dot-num ${step === i ? 'is-on' : ''}`}
                onClick={() => goStep(i)}
                aria-label={`Step ${i + 1}`}
              >{i + 1}</button>
            ))}
          </div>
          <button
            className="btn btn-primary arch-btn"
            onClick={() => goStep(Math.min(arch.walkthrough.length - 1, step + 1))}
            disabled={step >= arch.walkthrough.length - 1}
          >Next →</button>
        </div>
      )}
    </>
  );
}
