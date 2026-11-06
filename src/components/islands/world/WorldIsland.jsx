// The world island. Server-renders a complete flat list of every planet and moon,
// so crawlers, no-JS and no-WebGL visitors get the whole estate. After mount it
// upgrades to the lazily-loaded orrery only when the browser can draw WebGL and
// the visitor has not asked for reduced motion. Either way the inspector below
// is the same, and keyboard users reach every record through it.
import { useEffect, useState, lazy, Suspense } from 'react';

const WorldScene = lazy(() => import('./WorldScene.jsx'));

function detectWebGL() {
  try {
    const cv = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (cv.getContext('webgl') || cv.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

function findRecord(planets, id) {
  for (const p of planets) {
    if (p.id === id) return { kind: 'planet', label: p.label, detail: p.blurb, planet: p };
    const m = p.moons.find((x) => x.id === id);
    if (m) return { kind: 'moon', label: m.label, detail: m.detail, planet: p };
  }
  return null;
}

export default function WorldIsland({ planets: publicPlanets }) {
  const [planets, setPlanets] = useState(publicPlanets);
  const [use3D, setUse3D] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [touring, setTouring] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setUse3D(!reduced && detectWebGL());
  }, []);

  useEffect(() => {
    // Full detail exists only after Access sign-in. Everyone else is sent to the Access
    // login, so a redirect is not followed: it reads as "not signed in" and the public
    // model stays. Following it would fail on CORS and log a warning on every visit.
    fetch('/api/world/private', { credentials: 'same-origin', redirect: 'manual' })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => { if (m && Array.isArray(m.planets)) setPlanets(m.planets); })
      .catch((err) => console.warn('world: private detail unavailable, showing the public model', err));
  }, []);

  // A manual selection ends the tour, so the visitor is never fought for the camera.
  const select = (id) => { setTouring(false); setSelectedId(id || null); };
  const rec = selectedId ? findRecord(planets, selectedId) : null;

  // The tour is just a timer that picks each planet in turn. The scene's own camera flight
  // does the moving, so the tour and a click behave the same way.
  useEffect(() => {
    if (!touring) return undefined;
    let i = 0;
    setSelectedId(planets[0].id);
    const timer = setInterval(() => {
      i += 1;
      if (i < planets.length) {
        setSelectedId(planets[i].id);
      } else {
        setTouring(false);
        setSelectedId(null);
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [touring, planets]);

  return (
    <div className="grid gap-6">
      <div className="rounded-xl border-2 border-cyan bg-ink px-5 py-4 text-canvas">
        <p className="font-display text-xl font-semibold leading-snug">
          Built entirely with Claude Haiku 5.5, at xhigh effort, for testing.
        </p>
      </div>

      {use3D && (
        <div className="relative h-[68vh] min-h-[420px] w-full overflow-hidden rounded-xl border border-line bg-ink">
          <Suspense fallback={<p className="p-6 text-sm text-canvas">Loading the world…</p>}>
            <WorldScene planets={planets} selectedId={selectedId} onSelect={select} />
          </Suspense>
          <p className="pointer-events-none absolute left-4 top-4 max-w-[16rem] text-xs leading-relaxed text-canvas/80">
            Drag to look around, scroll to zoom. Click a planet or a moon to fly to it.
          </p>
          <div className="absolute bottom-4 right-4 flex gap-2">
            <button
              type="button"
              onClick={() => setTouring((t) => !t)}
              className="rounded-full border border-canvas px-4 py-2 text-sm text-canvas"
            >
              {touring ? 'Stop the tour' : 'Start the tour'}
            </button>
            {selectedId && !touring && (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-full bg-canvas px-4 py-2 text-sm text-ink"
              >
                Back to the whole system
              </button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-line p-5">
        {rec ? (
          <p className="text-sm leading-relaxed text-ink">
            <span className="mono-label">{rec.kind === 'planet' ? 'Planet' : `Moon of ${rec.planet.label}`}</span>
            <span className="mt-1 block font-display text-lg font-semibold">{rec.label}</span>
            {rec.kind === 'planet' && (
              <span className="mt-1 block text-sm text-ink-faint">{rec.planet.moons.length} records</span>
            )}
            <span className="mt-1 block text-ink-muted">{rec.detail}</span>
            <button type="button" className="mt-3 text-sm underline" onClick={() => select(null)}>
              Clear selection
            </button>
          </p>
        ) : (
          <p className="text-sm text-ink-muted">Select a planet or a moon to see what it is.</p>
        )}
      </div>

      <ol className="grid gap-6 sm:grid-cols-2">
        {planets.map((p) => (
          <li key={p.id} className="rounded-xl border border-line p-5">
            <button type="button" aria-pressed={selectedId === p.id} onClick={() => select(p.id)} className="text-left">
              <span className="mono-label">{p.moons.length} records</span>
              <span className="mt-1 block font-display text-lg font-semibold text-ink">{p.label}</span>
              <span className="mt-1 block text-sm text-ink-muted">{p.blurb}</span>
            </button>
            <ul className="mt-4 grid gap-2 text-sm text-ink-muted">
              {p.moons.map((m) => (
                <li key={m.id}>
                  <button type="button" aria-pressed={selectedId === m.id} onClick={() => select(m.id)} className="text-left hover:text-ink">
                    <span className="text-ink">{m.label}</span> — {m.detail}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
