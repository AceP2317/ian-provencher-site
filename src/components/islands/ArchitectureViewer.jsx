// The architecture viewer. Renders the 2D SVG scene on the server (so crawlers +
// no-JS get the full diagram, and hydration matches), then — after mount, only if
// the browser can do WebGL and the viewer isn't in a reduced-motion / small-mobile
// context — upgrades to the lazily-loaded 3D scene. A 2D/3D toggle lets the visitor
// choose; an error boundary drops back to 2D if the 3D scene ever throws. The
// inspector + walkthrough (Shell) are shared, so both scenes behave identically.
import { useEffect, useState, lazy, Suspense, Component } from 'react';
import { useArchController } from './arch/shared.jsx';
import Scene2D from './arch/Scene2D.jsx';
import Shell from './arch/Shell.jsx';

const Scene3D = lazy(() => import('./arch/Scene3D.jsx'));
const LS_KEY = 'arch-view-mode';
const RM_QUERY = '(prefers-reduced-motion: reduce)';

function detectWebGL() {
  try {
    const cv = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (cv.getContext('webgl') || cv.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

// If the 3D scene throws (driver quirk, context loss, …), fall back to 2D rather
// than white-screening the page.
class SceneErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError?.(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function ArchitectureViewer({ arch }) {
  const c = useArchController(arch);
  const [mode, setMode] = useState('2d'); // SSR-safe default; matches first client render
  const [canWebGL, setCanWebGL] = useState(false);

  // Lazy-initialized from matchMedia, NOT `useState(false)`. As a plain `false` it was only
  // corrected in an effect, which runs AFTER the first paint — so the opening frames of
  // every 3D mount (the bob, the damping, the idle auto-rotate) animated regardless of the
  // visitor's setting, which is exactly the moment the setting exists to cover.
  //
  // HYDRATION-SAFE, and only because `mode` starts at '2d' on the server AND on the client:
  // <Scene3D> is not in the first render tree, so `reduced` touches ZERO SSR'd markup and
  // cannot mismatch. The day someone initializes `mode` from localStorage instead, this
  // becomes a real hydration bug — move the read back into the effect at that point.
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(RM_QUERY).matches,
  );

  useEffect(() => {
    const webgl = detectWebGL();
    const mq = window.matchMedia(RM_QUERY);
    const smallTouch = window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900;
    setCanWebGL(webgl);
    setReduced(mq.matches);
    let saved = null;
    try { saved = localStorage.getItem(LS_KEY); } catch { /* ignore */ }
    if (saved === '3d' && webgl) setMode('3d');
    else if (saved === '2d') setMode('2d');
    else if (webgl && !smallTouch && !mq.matches) setMode('3d'); // auto-upgrade the capable, non-reduced-motion case

    // The setting can change mid-session (an OS toggle, a browser flag). Reading it once
    // with `[]` deps and never listening meant the change did nothing until a reload.
    //
    // `mode` is deliberately NOT re-derived here: a visitor who explicitly chose 3D keeps
    // 3D — it just goes still. Swapping their view out from under them is worse than the
    // motion they asked to stop.
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
      {/* The mode pills carry `btn btn-secondary` — the site's one interaction system:
          tokenized transitions, the ring/glow, the inset specular lip, the
          (reduced-motion-gated) sheen sweep and a real :active press, none of which they
          had. `.arch-mode` is now only a size/shape/state modifier on top of it — the same
          shape `.arch-btn` already uses two components down in Shell.jsx. */}
      {canWebGL && (
        <div className="arch-modes" role="group" aria-label="Diagram view">
          <button className={`btn btn-secondary arch-mode ${mode === '2d' ? 'is-on' : ''}`} onClick={() => choose('2d')} aria-pressed={mode === '2d'}>2D</button>
          <button className={`btn btn-secondary arch-mode ${mode === '3d' ? 'is-on' : ''}`} onClick={() => choose('3d')} aria-pressed={mode === '3d'}>3D</button>
        </div>
      )}
      <div className="arch-viewer">
        {show3d ? (
          <SceneErrorBoundary onError={() => choose('2d')} fallback={<Scene2D c={c} />}>
            <Suspense fallback={<Scene2D c={c} />}>
              <Scene3D c={c} reduced={reduced} />
            </Suspense>
          </SceneErrorBoundary>
        ) : (
          <Scene2D c={c} />
        )}
        <Shell c={c} />
      </div>
    </div>
  );
}
