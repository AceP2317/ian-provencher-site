// The bespoke Claude Code setup exhibit (react-three-fiber). Lazy-loaded, so
// three/drei only download when the capability gate picks 3D. A reactor-core
// "engine" sits at the center with counter-rotating rings; the operating layers
// float on a ring around it; the operator feeds in from one side and the outputs
// flow out the other, with animated packets running the conduits. Colors are
// resolved from the CSS design tokens at mount (WebGL can't read var()). Station
// selection drives the shared inspector. This is a purpose-built scene, not the
// generic architecture diagram viewer — only the scaffolding is shared.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { Bloom, StudioEnv } from '../arch/postfx.jsx';

// Resolve a `var(--token)` expression to its computed hex, once, at mount.
function resolveVar(expr, fallback = '#888888') {
  const m = /var\((--[\w-]+)\)/.exec(expr || '');
  const name = m ? m[1] : expr;
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

const ACCENT_VAR = {
  amber: '--color-accent',
  cyan: '--color-cyan',
  indigo: '--color-indigo',
  green: '--color-green',
  violet: '--color-violet',
};

const ENGINE_POS = [0, 0.1, 0];
const OPERATOR_POS = [-4.7, 0, 1.5];
const OUTPUT_POS = [4.7, 0, -1.5];
const RING_R = 2.85;

// Layer modules are placed on a ring around the engine, in data order.
function ringPos(i, n) {
  const a = (i / n) * Math.PI * 2 + Math.PI / 2;
  const y = 0.55 + Math.sin(i * 1.7) * 0.28;
  return [Math.cos(a) * RING_R, y, Math.sin(a) * RING_R];
}

function useLayout(stations) {
  return useMemo(() => {
    const layers = stations.filter((s) => s.zone === 'layer');
    const pos = new Map();
    for (const s of stations) {
      if (s.zone === 'core') pos.set(s.id, ENGINE_POS);
      else if (s.zone === 'operator') pos.set(s.id, OPERATOR_POS);
      else if (s.zone === 'output') pos.set(s.id, OUTPUT_POS);
    }
    layers.forEach((s, i) => pos.set(s.id, ringPos(i, layers.length)));
    return { pos, layers };
  }, [stations]);
}

function Label({ pos, color, text, on, selected, onSelect, hovered = false, setHovered }) {
  return (
    <Html position={[pos[0], pos[1] + 0.62, pos[2]]} center distanceFactor={9} zIndexRange={[20, 0]} style={{ pointerEvents: on ? 'auto' : 'none' }}>
      <button
        className="arch3d-label"
        aria-pressed={selected}
        aria-label={`${text} — details`}
        onClick={onSelect}
        // Hovering the label lights the MESH too, so the label and the thing it names
        // behave as one object rather than two overlapping hit targets.
        onMouseEnter={() => setHovered?.(true)}
        onMouseLeave={() => setHovered?.(false)}
        style={{
          borderColor: color,
          opacity: on ? 1 : 0.28,
          outline: selected ? `1px solid ${color}` : 'none',
          boxShadow: hovered && on ? `0 0 14px -2px ${color}` : 'none',
        }}
      >
        <span className="arch3d-dot" style={{ background: color }} />
        {text}
      </button>
    </Html>
  );
}

// The reactor core — an icosahedron with two counter-rotating rings.
function Core({ pos, color, reduced, on, selected, onSelect, hovered, setHovered }) {
  const ring1 = useRef();
  const ring2 = useRef();
  const inner = useRef();

  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : '';
    return () => { document.body.style.cursor = ''; };
  }, [hovered]);

  useFrame((state, dt) => {
    if (reduced) return;
    const t = state.clock.elapsedTime;
    if (ring1.current) ring1.current.rotation.z += dt * 0.5;
    if (ring2.current) ring2.current.rotation.x += dt * 0.35;
    if (inner.current) {
      inner.current.rotation.y = t * 0.25;
      // The breathe deepens slightly on hover — the engine spooling up under attention.
      const amp = hovered ? 0.07 : 0.04;
      const s = (selected ? 1.1 : 1) + Math.sin(t * 1.6) * amp;
      inner.current.scale.setScalar(s);
    }
  });

  return (
    <group
      position={pos}
      onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered?.(true); }}
      onPointerOut={() => setHovered?.(false)}
    >
      <mesh ref={inner}>
        <icosahedronGeometry args={[0.62, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected || hovered ? 1.45 : 1.05} roughness={0.2} metalness={0.4} toneMapped={false} />
      </mesh>
      <mesh ref={ring1} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[1.05, 0.03, 12, 60]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
      <mesh ref={ring2} rotation={[0, 0, Math.PI / 3]}>
        <torusGeometry args={[1.3, 0.022, 12, 60]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.8} toneMapped={false} />
      </mesh>
      <pointLight color={color} intensity={1.4} distance={6} decay={1.5} />
    </group>
  );
}

// A layer / operator / output module — a beveled slab that lifts + brightens on select.
function Module({ station, pos, color, on, selected, onSelect, reduced }) {
  const ref = useRef();
  const [hovered, setHovered] = useState(false);
  const isOperator = station.zone === 'operator';
  const isOutput = station.zone === 'output';

  // Nothing in this scene told a visitor a module was clickable — there was no hover
  // state at all. Reset on unmount, or un-mounting mid-hover strands the document in
  // `cursor: pointer`.
  useEffect(() => {
    if (!on) return undefined;
    document.body.style.cursor = hovered ? 'pointer' : '';
    return () => { document.body.style.cursor = ''; };
  }, [hovered, on]);

  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const bob = reduced ? 0 : Math.sin(state.clock.elapsedTime * 1.1 + pos[0] * 1.5) * 0.03;
    const lift = selected ? 0.22 : hovered && on ? 0.1 : 0;
    m.position.set(pos[0], pos[1] + bob + lift, pos[2]);
    const target = selected ? 1.16 : hovered && on ? 1.08 : 1;
    m.scale.x += (target - m.scale.x) * 0.15;
    m.scale.y = m.scale.z = m.scale.x;
  });

  const size = isOperator ? [0.9, 0.9, 0.9] : isOutput ? [1.5, 0.9, 0.6] : [1.15, 0.72, 0.34];

  // Emissive is what the bloom pass keys off, so hovering reads as the module coming up
  // to power rather than merely changing colour.
  const glow = selected ? 1.1 : hovered && on ? 0.8 : on ? 0.45 : 0.08;
  const hoverProps = {
    onPointerOver: (e) => { e.stopPropagation(); setHovered(true); },
    onPointerOut: () => setHovered(false),
  };

  return (
    <group>
      <group ref={ref} position={pos} onClick={(e) => { e.stopPropagation(); onSelect(); }} {...hoverProps}>
        {isOperator ? (
          <mesh>
            <icosahedronGeometry args={[0.5, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} transparent opacity={on ? 1 : 0.3} roughness={0.28} metalness={0.5} />
          </mesh>
        ) : (
          <RoundedBox args={size} radius={0.07} smoothness={4} steps={1}>
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} transparent opacity={on ? 1 : 0.28} roughness={0.3} metalness={0.5} />
          </RoundedBox>
        )}
      </group>
      <Label pos={pos} color={color} text={station.label} on={on} selected={selected} onSelect={onSelect} hovered={hovered} setHovered={setHovered} />
    </group>
  );
}

/**
 * A conduit with a travelling packet.
 *
 * These used to be dead-straight lines from the core to each ring module, which drew a
 * perfectly symmetric wheel-spoke star — the most generic "hub" visual there is. Bowing
 * each conduit turns the star into something that reads as plumbing wrapping a reactor,
 * and it lets the eye follow an individual run instead of losing it in the hub.
 */
function Conduit({ a, b, color, on, reduced, phase }) {
  const packet = useRef();

  const curve = useMemo(() => {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const dir = B.clone().sub(A);
    const len = dir.length() || 1;
    // Bow perpendicular to the run, and lift slightly, so the arc clears the core.
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const mid = A.clone().add(B).multiplyScalar(0.5)
      .addScaledVector(perp, len * 0.16);
    mid.y += 0.28;
    return new THREE.QuadraticBezierCurve3(A, mid, B);
  }, [a, b]);

  const points = useMemo(() => curve.getPoints(26), [curve]);

  useFrame((state) => {
    const p = packet.current;
    if (!p) return;
    const t = (state.clock.elapsedTime * 0.32 + phase) % 1;
    p.position.copy(curve.getPointAt(t));
  });

  return (
    <group>
      <Line points={points} color={color} lineWidth={on ? 2 : 1} transparent opacity={on ? 0.7 : 0.1} />
      {on && !reduced && (
        <mesh ref={packet}>
          <sphereGeometry args={[0.06, 12, 12]} />
          {/* toneMapped={false} was ALREADY here — it just had no bloom pass to land in,
              so the packet rendered as a flat grey dot instead of a spark. */}
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.4} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

// Gently lerp the orbit target toward the centroid of the focused stations.
function CameraFocus({ controls, target, reduced }) {
  useFrame(() => {
    const ctl = controls.current;
    if (!ctl || !ctl.target) return;
    const k = reduced ? 1 : 0.06;
    ctl.target.x += (target[0] - ctl.target.x) * k;
    ctl.target.y += (target[1] - ctl.target.y) * k;
    ctl.target.z += (target[2] - ctl.target.z) * k;
    ctl.update();
  });
  return null;
}

export default function Scene3D({ c, reduced }) {
  const { setup, selected, select, stationOn, focusIds } = c;
  const controls = useRef();
  const { pos, layers } = useLayout(setup.stations);

  // The core's mesh and its label are two separate hit targets for the SAME station, so
  // the hover state is lifted here — hovering either one lights both.
  const [coreHover, setCoreHover] = useState(false);

  const palette = useMemo(() => {
    const accent = {};
    for (const [k, v] of Object.entries(ACCENT_VAR)) accent[k] = resolveVar(`var(${v})`);
    return {
      accent,
      canvas: resolveVar('var(--color-canvas)', '#0f1117'),
      edge: resolveVar('var(--color-ink-faint)', '#838b9e'),
      grid: resolveVar('var(--color-line)', '#262c3a'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colorOf = (s) => palette.accent[s.accent] || palette.edge;

  const centroid = useMemo(() => {
    let x = 0, y = 0, z = 0, k = 0;
    for (const id of focusIds) { const p = pos.get(id); if (p) { x += p[0]; y += p[1]; z += p[2]; k++; } }
    return k ? [x / k, y / k, z / k] : [0, 0, 0];
  }, [focusIds, pos]);

  const idle = c.step < 0 && !selected;

  // Conduits: operator → engine, engine → each layer, engine → outputs.
  const conduits = [];
  const eng = pos.get('engine');
  const op = pos.get('operator');
  const out = pos.get('outputs');
  if (op && eng) conduits.push({ a: op, b: eng, color: palette.accent.amber, on: stationOn('operator'), key: 'op' });
  layers.forEach((s, i) => {
    const p = pos.get(s.id);
    if (p && eng) conduits.push({ a: eng, b: p, color: colorOf(s), on: stationOn(s.id), key: s.id, phase: (i * 0.3) % 1 });
  });
  if (out && eng) conduits.push({ a: eng, b: out, color: palette.accent.green, on: stationOn('outputs'), key: 'out', phase: 0.5 });

  return (
    /* panel--flat: an opaque WebGL canvas fills this box edge to edge, so a
       backdrop-filter behind it blurs nothing and costs a re-raster for free. */
    <div className="arch3d-canvas panel panel--flat">
      <Canvas
        dpr={[1, 2]}
        // Pulled back from [4.5, 3.4, 8.5], which cropped the Outputs module off the right
        // edge at the default framing. Found by looking at the rendered scene, not by
        // reading the layout constants.
        camera={{ position: [5.4, 3.9, 10.4], fov: 45 }}
        onPointerMissed={() => selected && select(selected)}
      >
        <color attach="background" args={[palette.canvas]} />
        <fog attach="fog" args={[palette.canvas, 11, 26]} />
        {/* Ambient comes down because the env map + the core's own pointLight now carry
            the fill. Left at 0.5 it flattens the emissive contrast the bloom keys off. */}
        <ambientLight intensity={0.35} />
        <directionalLight position={[6, 7, 5]} intensity={0.7} />
        <directionalLight position={[-6, -2, -5]} intensity={0.2} />
        <StudioEnv />
        <gridHelper args={[30, 30, palette.grid, palette.grid]} position={[0, -1.7, 0]} />

        {conduits.map((cd) => (
          <Conduit key={cd.key} a={cd.a} b={cd.b} color={cd.color} on={cd.on} reduced={reduced} phase={cd.phase ?? 0} />
        ))}

        {setup.stations.map((s) => {
          if (s.zone === 'core') {
            return (
              <Core
                key={s.id}
                pos={pos.get(s.id)}
                color={colorOf(s)}
                reduced={reduced}
                on={stationOn(s.id)}
                selected={selected === s.id}
                onSelect={() => select(s.id)}
                hovered={coreHover}
                setHovered={setCoreHover}
              />
            );
          }
          return (
            <Module
              key={s.id}
              station={s}
              pos={pos.get(s.id)}
              color={colorOf(s)}
              on={stationOn(s.id)}
              selected={selected === s.id}
              onSelect={() => select(s.id)}
              reduced={reduced}
            />
          );
        })}

        {/* the engine core also carries a clickable label */}
        {(() => {
          const e = setup.stations.find((s) => s.zone === 'core');
          if (!e) return null;
          return (
            <Label
              pos={pos.get(e.id)}
              color={colorOf(e)}
              text={e.label}
              on={stationOn(e.id)}
              selected={selected === e.id}
              onSelect={() => select(e.id)}
              hovered={coreHover}
              setHovered={setCoreHover}
            />
          );
        })()}

        <OrbitControls
          ref={controls}
          makeDefault
          enableDamping={!reduced}
          dampingFactor={0.08}
          autoRotate={idle && !reduced}
          autoRotateSpeed={0.55}
          minDistance={5}
          maxDistance={18}
          maxPolarAngle={Math.PI * 0.9}
          minPolarAngle={Math.PI * 0.06}
          enablePan={false}
        />
        <CameraFocus controls={controls} target={centroid} reduced={reduced} />

        {/* Must come last: it takes over the render loop (positive useFrame priority).
            This is what every emissive value and every toneMapped={false} in this scene —
            the reactor core, its rings, the conduit packets — was always written for.

            Tuned by LOOKING at it: at strength 1.05 / threshold 0.45 the core blew out into
            a white blob and ate the ring modules behind it. Raising the threshold keeps the
            bloom on genuinely hot pixels only, so the core reads as glowing rather than
            overexposed and the icosahedron's facets survive. */}
        <Bloom strength={0.8} radius={0.6} threshold={0.62} />
      </Canvas>
    </div>
  );
}
