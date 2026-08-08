// The "Claude Code Setup" exhibit island. Renders the SSR-safe static fallback on
// the server (so crawlers + no-JS get the full workflow, and hydration matches),
// then — only if the browser can do WebGL and isn't in a reduced-motion /
// small-mobile context — upgrades to the lazily-loaded bespoke 3D scene. A 2D/3D
// toggle lets the visitor choose; an error boundary drops back to the static view
// if the scene ever throws. The inspector + guided tour are shared across both.
//
// Mirrors the architecture viewer's proven scaffolding (capability gate, lazy
// scene, error boundary, token-color bridge, shared controller) but drives a
// purpose-built scene and data model. Reuses the .arch-* CSS chrome verbatim.
import { useEffect, useMemo, useState, lazy, Suspense, Component } from 'react';
import Fallback from './setup/Fallback.jsx';
import { Rich } from './arch/shared.jsx';

const Scene3D = lazy(() => import('./setup/Scene3D.jsx'));
const LS_KEY = 'setup-view-mode';

const ACCENT_VAR = {
  amber: 'var(--color-accent)',
  cyan: 'var(--color-cyan)',
  indigo: 'var(--color-indigo)',
  green: 'var(--color-green)',
  violet: 'var(--color-violet)',
};

function detectWebGL() {
  try {
    const cv = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (cv.getContext('webgl') || cv.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

// The one state machine — selected station + guided-tour step — plus the derived
// lookups the scene, the fallback, and the inspector all read.
function useSetupController(setup) {
  const [step, setStep] = useState(-1); // -1 = overview
  const [selected, setSelected] = useState(null); // station id

  const stationById = useMemo(() => new Map(setup.stations.map((s) => [s.id, s])), [setup]);

  const active = useMemo(() => {
    if (selected) return new Set([selected]);
    if (step >= 0) {
      const f = setup.tour[step].focus;
      return f && f.length ? new Set(f) : null; // null = whole rig
    }
    return null;
  }, [selected, step, setup]);

  // The engine core stays lit even when it isn't the focus, so the reactor never
  // fully dims out.
  const stationOn = (id) => !active || active.has(id) || id === 'engine';
  const focusIds = active ? [...active] : setup.stations.map((s) => s.id);

  const select = (id) => setSelected((cur) => (cur === id ? null : id));
  const goStep = (s) => { setStep(s); setSelected(null); };
  const clearSel = () => setSelected(null);

  const sel = selected ? stationById.get(selected) : null;

  return { setup, step, selected, stationById, active, stationOn, focusIds, select, goStep, clearSel, sel };
}

// Drop back to the static fallback rather than white-screening if the scene throws.
class SceneErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError?.(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function Inspector({ c }) {
  const { setup, step, sel, goStep, clearSel } = c;
  return (
    <>
      <aside className="arch-panel panel">
        {sel ? (
          <div>
            <div className="arch-kind" style={{ color: ACCENT_VAR[sel.accent] }}>
              <span className="arch-kind-dot" style={{ background: ACCENT_VAR[sel.accent] }} />
              {sel.kicker}
            </div>
            <h2 className="arch-h">{sel.label}</h2>
            <p className="arch-sub">{sel.tagline}</p>
            <div className="arch-body"><Rich text={sel.why} /></div>
            <button className="arch-clear link-sweep" onClick={clearSel}>← back to the tour</button>
          </div>
        ) : step >= 0 ? (
          <div>
            <div className="arch-kind" style={{ color: 'var(--color-cyan-deep)' }}>
              Step {step + 1} of {setup.tour.length}
            </div>
            <h2 className="arch-h">{setup.tour[step].title}</h2>
            <div className="arch-body"><Rich text={setup.tour[step].body} /></div>
          </div>
        ) : (
          <div>
            <div className="arch-kind" style={{ color: 'var(--color-label)' }}>Overview</div>
            <h2 className="arch-h">{setup.title}</h2>
            <p className="arch-sub" style={{ marginBottom: '0.75rem' }}>{setup.tagline}</p>
            <div className="arch-body"><Rich text={setup.story} /></div>
          </div>
        )}
      </aside>

      <div className="arch-controls">
        <button className="btn btn-secondary arch-btn" onClick={() => goStep(Math.max(-1, step - 1))} disabled={step < 0}>← Prev</button>
        <div className="arch-dots">
          <button className={`btn btn-secondary arch-dot ${step < 0 ? 'is-on' : ''}`} onClick={() => goStep(-1)} aria-label="Overview">Overview</button>
          {setup.tour.map((_, i) => (
            <button key={i} className={`btn btn-secondary arch-dot arch-dot-num ${step === i ? 'is-on' : ''}`} onClick={() => goStep(i)} aria-label={`Step ${i + 1}`}>{i + 1}</button>
          ))}
        </div>
        <button className="btn btn-primary arch-btn" onClick={() => goStep(Math.min(setup.tour.length - 1, step + 1))} disabled={step >= setup.tour.length - 1}>Next →</button>
      </div>
    </>
  );
}

export default function ClaudeSetupExhibit({ setup }) {
  const c = useSetupController(setup);
  const [mode, setMode] = useState('2d'); // SSR-safe default; matches first client render
  const [canWebGL, setCanWebGL] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const webgl = detectWebGL();
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const smallTouch = window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900;
    setCanWebGL(webgl);
    setReduced(mq.matches);
    let saved = null;
    try { saved = localStorage.getItem(LS_KEY); } catch { /* ignore */ }
    if (saved === '3d' && webgl) setMode('3d');
    else if (saved === '2d') setMode('2d');
    else if (webgl && !smallTouch && !mq.matches) setMode('3d');

    // Mid-session OS toggle must take effect without a reload (same fix as
    // ArchitectureViewer). `mode` is deliberately not re-derived — an explicit
    // 3D choice stays 3D, it just goes still.
    const onChange = (ev) => setReduced(ev.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const choose = (m) => {
    setMode(m);
    try { localStorage.setItem(LS_KEY, m); } catch { /* ignore */ }
  };

  const show3d = mode === '3d' && canWebGL;

  return (
    <div className="arch-viewer-wrap">
      {canWebGL && (
        <div className="arch-modes" role="group" aria-label="Exhibit view">
          <button className={`btn btn-secondary arch-mode ${mode === '2d' ? 'is-on' : ''}`} onClick={() => choose('2d')} aria-pressed={mode === '2d'}>Diagram</button>
          <button className={`btn btn-secondary arch-mode ${mode === '3d' ? 'is-on' : ''}`} onClick={() => choose('3d')} aria-pressed={mode === '3d'}>3D</button>
        </div>
      )}
      <div className="arch-viewer">
        {show3d ? (
          <SceneErrorBoundary onError={() => choose('2d')} fallback={<Fallback c={c} />}>
            <Suspense fallback={<Fallback c={c} />}>
              <Scene3D c={c} reduced={reduced} />
            </Suspense>
          </SceneErrorBoundary>
        ) : (
          <Fallback c={c} />
        )}
        <Inspector c={c} />
      </div>
    </div>
  );
}
