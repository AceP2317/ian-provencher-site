// The city island. It renders the Enter gate, the walkable city once the visitor enters, its controls, and
// the same records as a plain list for crawlers and for visitors whose device cannot draw the city. The 3D
// scene is a lazy import, so nothing heavy loads until Enter.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { buildCity } from './city/layout.js';
import { RATES } from './city/clock.js';
import { LOOKS } from './city/looks.js';
import { soundPlan } from './city/mix.js';

const CityScene = lazy(() => import('./city/CityScene.jsx'));

const CLOCK = [
  { label: 'Pause', rate: RATES.pause },
  { label: 'Real time', rate: RATES.real },
  { label: '60x', rate: RATES.fast },
  { label: '600x', rate: RATES.faster },
  { label: 'Rewind', rate: RATES.rewind },
];

// What the shapes mean, per family. Height and light are only ever drawn from data the site publishes.
const MEANING = {
  cron: 'Taller means it runs more often. Windows flash on a replayed clock; the times are the published cadence, not a live feed.',
  architectures: 'Taller means more parts in its diagram. Lights are steady.',
  builds: 'Height is decoration. Lights are steady.',
  repos: 'Brighter windows mean a more recent push, as of the last build. Height is decoration.',
  stack: 'Height follows the count of hooks, skills and subagents; the doctrine building is mid-height.',
};

const MOVE_KEYS = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];
const STICK_RADIUS = 60;
const clamp1 = (v) => Math.min(1, Math.max(-1, v));
const GIVE_UP_SECONDS = 2;

function detectCapability() {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let webgl = false;
  try {
    const cv = document.createElement('canvas');
    webgl = !!(window.WebGLRenderingContext && (cv.getContext('webgl2') || cv.getContext('webgl')));
  } catch {
    webgl = false;
  }
  const phone = window.innerWidth < 640 || !!window.matchMedia?.('(pointer: coarse)').matches;
  return { use3D: !reduced && webgl, phone };
}

export default function WorldCity({ planets }) {
  const city = useMemo(() => buildCity(planets), [planets]);
  const districtsJson = useMemo(
    () => JSON.stringify(city.districts.map((d) => ({ id: d.id, label: d.label, count: d.count, bounds: d.bounds, gate: d.gate, travel: d.travel }))),
    [city],
  );
  const look = LOOKS[0];
  const [entered, setEntered] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [rate, setRate] = useState(RATES.real);
  const [nearest, setNearest] = useState(null);
  const [card, setCard] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [cap, setCap] = useState({ use3D: false, phone: false });
  const [soundState, setSoundState] = useState('off');

  const sim = useRef({ t: 0, rate: RATES.real });
  const input = useRef({ keys: {}, stick: { x: 0, y: 0 }, look: { dx: 0, dy: 0 }, pressed: [], travel: null });
  const drag = useRef(null);
  const touch = useRef({ stick: null, look: null });
  const audio = useRef({ rain: 0, driving: false, speed: 0 });
  const soundRef = useRef(null);
  const muted = useRef(false);
  const audioOut = useRef(null);
  const dom = {
    pos: useRef(null),
    veh: useRef(null),
    sig: useRef(null),
    mode: useRef(null),
    ready: useRef(null),
    sim: useRef(null),
  };

  useEffect(() => {
    setCap(detectCapability());
  }, []);

  useEffect(() => {
    if (!cap.use3D || !entered) return undefined;
    const keys = input.current.keys;
    const down = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (MOVE_KEYS.includes(k)) e.preventDefault();
      if (k === 'e' && !e.repeat) input.current.pressed.push('e');
      keys[k] = true;
    };
    const up = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keys[k] = false;
    };
    const blur = () => {
      for (const k of Object.keys(keys)) keys[k] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [cap.use3D, entered]);

  // A test seam: ?giveup=1 makes the city give up after a short wait, so the list and the message can be checked.
  useEffect(() => {
    if (!entered || new URLSearchParams(window.location.search).get('giveup') !== '1') return undefined;
    const id = setTimeout(() => setGaveUp(true), GIVE_UP_SECONDS * 1000);
    return () => clearTimeout(id);
  }, [entered]);

  useEffect(() => {
    const id = setInterval(() => {
      const s = soundRef.current;
      if (!s) return;
      const plan = soundPlan({ ...audio.current, muted: muted.current });
      s.apply(plan);
      if (audioOut.current) {
        audioOut.current.dataset.rain = plan.rain.toFixed(3);
        audioOut.current.dataset.engine = plan.engine > 0 ? '1' : '0';
      }
    }, 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => soundRef.current?.close(), []);

  const onSound = async () => {
    if (!soundRef.current) {
      const { createSoundscape } = await import('./city/sound.js');
      soundRef.current = createSoundscape();
    }
    muted.current = false;
    setSoundState('on');
  };
  const onMute = () => {
    muted.current = !muted.current;
    setSoundState(muted.current ? 'muted' : 'on');
  };

  const setClock = (r) => {
    sim.current.rate = r;
    setRate(r);
  };
  const toggleCard = (id) => setCard((c) => (c === id ? null : id));

  const onTouchStart = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const left = t.clientX - box.left < box.width / 2;
      if (left && !touch.current.stick) touch.current.stick = { id: t.identifier, x: t.clientX, y: t.clientY };
      else if (!left && !touch.current.look) touch.current.look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  };
  const onTouchMove = (e) => {
    for (const t of e.changedTouches) {
      const s = touch.current.stick;
      if (s && t.identifier === s.id) {
        input.current.stick = {
          x: clamp1((t.clientX - s.x) / STICK_RADIUS),
          y: clamp1(-(t.clientY - s.y) / STICK_RADIUS),
        };
      }
      const l = touch.current.look;
      if (l && t.identifier === l.id) {
        input.current.look.dx += t.clientX - l.x;
        input.current.look.dy += t.clientY - l.y;
        l.x = t.clientX;
        l.y = t.clientY;
      }
    }
  };
  const onTouchEnd = (e) => {
    for (const t of e.changedTouches) {
      if (touch.current.stick?.id === t.identifier) {
        touch.current.stick = null;
        input.current.stick = { x: 0, y: 0 };
      }
      if (touch.current.look?.id === t.identifier) touch.current.look = null;
    }
  };
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    // A press on the city's own buttons is a choice, not a request to take the mouse.
    if (e.target.closest?.('button')) return;
    drag.current = { x: e.clientX, y: e.clientY };
    if (!document.pointerLockElement) e.currentTarget.requestPointerLock?.();
  };
  const onPointerMove = (e) => {
    if (document.pointerLockElement === e.currentTarget) {
      input.current.look.dx += e.movementX;
      input.current.look.dy += e.movementY;
    } else if (drag.current) {
      input.current.look.dx += e.clientX - drag.current.x;
      input.current.look.dy += e.clientY - drag.current.y;
      drag.current = { x: e.clientX, y: e.clientY };
    }
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const byId = new Map(city.buildings.map((b) => [b.id, b]));
  const nearBuilding = nearest ? byId.get(nearest) : undefined;
  const cardBuilding = card ? byId.get(card) : undefined;
  const nearLine = nearBuilding
    ? `Nearest: ${nearBuilding.label}. Press E, or Use, to open its card.`
    : 'Walk up to a building to read its card.';

  const buttonClass = (on) =>
    `rounded-full border px-4 py-2 text-sm ${on ? 'border-ink bg-ink text-canvas' : 'border-line-2 text-ink'}`;

  const scene = (
    <div
      data-world="view"
      className="relative h-[62vh] min-h-[380px] w-full touch-none overflow-hidden rounded-xl border border-line bg-ink"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <Suspense fallback={<p className="p-6 text-sm text-canvas">Loading the city…</p>}>
        <CityScene
          city={city}
          look={look}
          input={input}
          sim={sim.current}
          dom={dom}
          phone={cap.phone}
          audio={audio}
          onNearest={setNearest}
          onInteract={toggleCard}
          onGiveUp={() => setGaveUp(true)}
        />
      </Suspense>
      <p className="pointer-events-none absolute left-4 top-4 max-w-[17rem] text-xs leading-relaxed text-canvas/85">
        {cap.phone
          ? 'Left side of the screen: move. Right side: look.'
          : 'W A S D to walk, mouse or arrow keys to look, E to open a card or get into the car. Click to take the mouse.'}
      </p>
      <div className="absolute bottom-4 right-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          aria-expanded={mapOpen}
          onClick={() => setMapOpen((m) => !m)}
          className="rounded-full border border-canvas px-4 py-2 text-sm text-canvas"
        >
          Map
        </button>
        <button
          type="button"
          onClick={() => {
            input.current.pressed.push('e');
          }}
          className="rounded-full bg-canvas px-4 py-2 text-sm text-ink"
        >
          Use (E)
        </button>
        <button
          type="button"
          onClick={soundState === 'off' ? onSound : onMute}
          className="rounded-full border border-canvas px-4 py-2 text-sm text-canvas"
        >
          {soundState === 'off' ? 'Sound' : soundState === 'on' ? 'Mute' : 'Unmute'}
        </button>
      </div>
      {mapOpen && (
        <div className="absolute left-4 bottom-16 grid max-h-[calc(100%-5rem)] max-w-[18rem] gap-1.5 overflow-y-auto rounded-lg bg-canvas/95 p-3 text-xs text-ink">
          <span className="mono-label">The city</span>
          {city.districts.map((d) => (
            <div key={d.id} className="grid gap-1 rounded border border-line p-2">
              <span className="font-semibold">
                {d.label} · {d.count}
              </span>
              <span className="text-ink-muted">{MEANING[d.id]}</span>
              <button
                type="button"
                className="justify-self-start underline"
                onClick={() => {
                  input.current.travel = d.id;
                }}
              >
                Go there
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const poster = (
    <div className="relative grid min-h-[320px] place-items-center overflow-hidden rounded-xl border border-line bg-ink p-8 text-center">
      <div className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 opacity-40"></div>
      <div className="relative grid max-w-xl gap-4">
        <p className="mono-label text-canvas/80">A night city, every record a building</p>
        <p className="text-base leading-relaxed text-canvas">
          Walk the estate&apos;s scheduled jobs, architectures, builds, repositories and operating stack. Nothing heavy
          loads until you enter.
        </p>
        <button
          type="button"
          data-world="enter"
          onClick={() => setEntered(true)}
          className="justify-self-center rounded-full bg-canvas px-6 py-3 text-sm text-ink"
        >
          Enter the city
        </button>
      </div>
    </div>
  );

  return (
    <div className="grid gap-6">
      {!cap.use3D && (
        <p className="rounded-xl border border-line p-5 text-sm leading-relaxed text-ink-muted">
          The walkable city needs WebGL and motion that is not reduced. Every record is listed below.
        </p>
      )}
      {cap.use3D && gaveUp && (
        <p data-world="gaveup" className="rounded-xl border border-line p-5 text-sm leading-relaxed text-ink-muted">
          This device is too slow for the city, so here is the list. Every record is listed below.
        </p>
      )}
      {cap.use3D && !gaveUp && !entered && poster}
      {cap.use3D && !gaveUp && entered && scene}

      {cap.use3D && !gaveUp && entered && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Clock">
            {CLOCK.map((c) => (
              <button
                key={c.label}
                type="button"
                aria-pressed={rate === c.rate}
                onClick={() => setClock(c.rate)}
                className={buttonClass(rate === c.rate)}
              >
                {c.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                sim.current.t = 0;
              }}
              className="rounded-full border border-line-2 px-4 py-2 text-sm text-ink"
            >
              Back to the start
            </button>
          </div>
          <output ref={dom.sim} data-world="sim" className="mono-label text-ink-muted" />
        </div>
      )}

      <p aria-live="polite" className="text-sm text-ink-muted">
        {nearLine}
      </p>

      {cardBuilding && (
        <section
          data-world="card"
          data-id={cardBuilding.id}
          aria-label="Building card"
          className="grid gap-2 rounded-xl border border-line-2 bg-surface p-5"
        >
          <span className="mono-label">{cardBuilding.cadence}</span>
          <span className="font-display text-lg font-semibold text-ink">{cardBuilding.label}</span>
          <span className="text-sm leading-relaxed text-ink-muted">{cardBuilding.detail}</span>
          <button type="button" className="justify-self-start text-sm underline" onClick={() => setCard(null)}>
            Close the card
          </button>
        </section>
      )}

      <dl className="grid gap-2 text-sm leading-relaxed text-ink-muted sm:grid-cols-2">
        <dt className="col-span-full mono-label">What the shapes mean</dt>
        {city.districts.map((d) => (
          <div key={d.id} className="grid gap-0.5">
            <dt className="font-semibold text-ink">{d.label}</dt>
            <dd>{MEANING[d.id]}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="mono-label text-ink-muted">Sound</span>
        <output ref={audioOut} data-world="audio" data-state={soundState} className="text-ink-muted" />
      </div>

      {city.districts.map((d) => (
        <details key={d.id} open className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer font-display text-base font-semibold text-ink">
            {d.label} · {d.count}
          </summary>
          <ol className="mt-3 grid gap-3 sm:grid-cols-2">
            {city.buildings
              .filter((b) => b.district === d.id)
              .map((b) => (
                <li key={b.id} className="rounded-xl border border-line p-4">
                  {b.cadence && <span className="mono-label">{b.cadence}</span>}
                  <span className="mt-1 block font-display text-base font-semibold text-ink">{b.label}</span>
                  <span className="mt-1 block text-sm text-ink-muted">{b.detail}</span>
                  <button
                    type="button"
                    aria-pressed={card === b.id}
                    onClick={() => toggleCard(b.id)}
                    className="mt-3 text-sm underline"
                  >
                    {card === b.id ? 'Close its card' : 'Open its card'}
                  </button>
                </li>
              ))}
          </ol>
        </details>
      ))}

      <output data-world="districts" data-json={districtsJson} className="sr-only" />
      <output ref={dom.pos} data-world="pos" className="sr-only" />
      <output ref={dom.veh} data-world="veh" className="sr-only" />
      <output ref={dom.sig} data-world="sig" className="sr-only" />
      <output ref={dom.mode} data-world="mode" data-mode="walk" className="sr-only" />
      <output ref={dom.ready} data-world="ready" className="sr-only" />
    </div>
  );
}
