// The estate as a night-sky orrery. The sun is the model, each planet is a mechanism
// family on its own orbit, and each moon is one record. The camera opens with a
// flight in, flies to whatever you select, then follows it so you can orbit it.
// Colours come from the design tokens through the one shared resolver, because three
// cannot parse oklch(). The sky is the site's own ink token, so it stays on palette.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line, Stars, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { resolveTokenColor } from '../arch/shared.jsx';
import { hash, rng } from './shared/noise.js';

const WHITE = new THREE.Color(1, 1, 1);
const BLACK = new THREE.Color(0, 0, 0);
const PLANET_OFFSET = new THREE.Vector3(0, 2.4, 4.4);
const MOON_OFFSET = new THREE.Vector3(0, 0.9, 1.8);
const OVERVIEW_OFFSET = new THREE.Vector3(0, 13, 24);
// On a phone the whole system is drawn at a fraction of its size, so the overview sits closer.
const NARROW_LAYOUT = 0.66;
const OVERVIEW_NARROW = new THREE.Vector3(0, 15, 31);
const INTRO_FROM = new THREE.Vector3(0, 60, 120);

// Orbit radius and speed per planet. Inner planets run faster, as they would.
const INNER_ORBIT = 4.2;
const ORBIT_GAP = 2.5;
const orbitRadius = (i) => INNER_ORBIT + i * ORBIT_GAP;
const orbitSpeed = (i) => 0.2 / Math.sqrt(1 + i * 0.7);

function circle(r, n) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    pts.push([Math.cos(a) * r, 0, Math.sin(a) * r]);
  }
  return pts;
}

// Banded planet surface, painted once from the planet's own colour.
function bandTexture(base, seed) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const g = cv.getContext('2d');
  const r = rng(seed);
  let y = 0;
  while (y < 256) {
    const h = 3 + Math.floor(r() * 12);
    const t = (r() - 0.5) * 0.6;
    const col = t >= 0 ? base.clone().lerp(WHITE, t) : base.clone().lerp(BLACK, -t * 0.8);
    g.fillStyle = col.getStyle();
    g.fillRect(0, y, 512, h);
    y += h;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A soft white disc, tinted per use, for halos and the sun's corona.
function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

function Glow({ texture, color, size, opacity }) {
  return (
    <sprite scale={[size, size, 1]} raycast={() => null}>
      <spriteMaterial map={texture} color={color} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

function Sun({ color, glow }) {
  return (
    <group>
      <mesh raycast={() => null}>
        <sphereGeometry args={[1.25, 48, 48]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Glow texture={glow} color={color} size={4.2} opacity={0.75} />
      <Glow texture={glow} color={color} size={9} opacity={0.22} />
      <Glow texture={glow} color={color} size={18} opacity={0.07} />
      <pointLight color={color} intensity={140} decay={2} />
      <Html position={[0, -2.1, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <span className="mono-label whitespace-nowrap rounded bg-ink/85 px-1.5 py-0.5 text-canvas">The model</span>
      </Html>
    </group>
  );
}

function Moon({ moon, base, glow, selected, hovered, onSelect, onHover, bodies }) {
  const pivot = useRef();
  const mesh = useRef();
  const scale = useRef(1);
  useFrame(({ clock }) => {
    if (pivot.current) pivot.current.rotation.y = clock.elapsedTime * moon.speed + moon.phase;
    const want = selected ? 2.1 : hovered ? 1.6 : 1;
    scale.current += (want - scale.current) * 0.18;
    if (mesh.current) mesh.current.scale.setScalar(scale.current);
  });
  useEffect(() => {
    bodies.current.set(moon.id, { obj: mesh.current, offset: MOON_OFFSET });
    return () => bodies.current.delete(moon.id);
  }, [moon.id, bodies]);
  return (
    <group ref={pivot}>
      <mesh
        ref={mesh}
        position={[moon.radius, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onSelect(moon.id); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(moon.id); }}
        onPointerOut={() => onHover(null)}
      >
        <sphereGeometry args={[0.09, 20, 20]} />
        <meshStandardMaterial color={base} emissive={base} emissiveIntensity={selected ? 1.1 : 0.55} roughness={0.4} />
      </mesh>
      <Glow texture={glow} color={base} size={0.7} opacity={selected || hovered ? 0.7 : 0.28} />
      {(selected || hovered) && (
        <Html position={[moon.radius, 0.28, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <span className="mono-label whitespace-nowrap rounded bg-ink/85 px-1.5 py-0.5 text-canvas">{moon.label}</span>
        </Html>
      )}
    </group>
  );
}

function Planet({ planet, index, base, glow, selectedId, hoverId, compact, onSelect, onHover, bodies }) {
  const R = orbitRadius(index);
  const speed = orbitSpeed(index);
  const size = 0.42 + 0.06 * Math.sqrt(planet.moons.length);
  const outer = useRef();
  const body = useRef();
  const surface = useMemo(() => bandTexture(base, hash(planet.id)), [base, planet.id]);
  const moonRings = useMemo(
    () => [...new Set(planet.moons.map((m) => m.radius.toFixed(2)))].map(Number),
    [planet.moons],
  );
  const orbitPts = useMemo(() => circle(R, 180), [R]);
  const hasRing = planet.moons.length > 6;
  const selected = selectedId === planet.id;

  useFrame(({ clock }) => {
    if (outer.current) outer.current.rotation.y = clock.elapsedTime * speed + index * 1.3;
  });
  useEffect(() => {
    bodies.current.set(planet.id, { obj: body.current, offset: PLANET_OFFSET });
    return () => bodies.current.delete(planet.id);
  }, [planet.id, bodies]);

  return (
    <group ref={outer}>
      <Line points={orbitPts} color={base} lineWidth={1.5} transparent opacity={0.55} raycast={() => null} />
      <group ref={body} position={[R, 0, 0]}>
        <mesh
          onClick={(e) => { e.stopPropagation(); onSelect(planet.id); }}
          onPointerOver={(e) => { e.stopPropagation(); onHover(planet.id); }}
          onPointerOut={() => onHover(null)}
        >
          <sphereGeometry args={[size, 56, 56]} />
          <meshStandardMaterial map={surface} emissive={base} emissiveIntensity={selected ? 0.3 : 0.1} roughness={0.85} />
        </mesh>
        <Glow texture={glow} color={base} size={size * 3.2} opacity={selected ? 0.2 : 0.1} />
        {hasRing && (
          <mesh rotation={[Math.PI / 2.2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[size * 1.5, size * 2.4, 160]} />
            <meshBasicMaterial color={base} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        )}
        {/* On a phone the planets sit close together, so names appear only when they are in play. */}
        {(!compact || selected || hoverId === planet.id) && (
          <Html position={[0, size + 0.55, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
            <span className={`mono-label whitespace-nowrap rounded px-1.5 py-0.5 ${selected || hoverId === planet.id ? 'bg-canvas text-ink' : 'bg-ink/85 text-canvas'}`}>
              {planet.label}
            </span>
          </Html>
        )}
        {moonRings.map((r) => (
          <Line key={r} points={circle(r, 96)} color={base} lineWidth={1} transparent opacity={0.28} raycast={() => null} />
        ))}
        {planet.moons.map((moon) => (
          <Moon
            key={moon.id}
            moon={moon}
            base={base}
            glow={glow}
            selected={selectedId === moon.id}
            hovered={hoverId === moon.id}
            onSelect={onSelect}
            onHover={onHover}
            bodies={bodies}
          />
        ))}
      </group>
    </group>
  );
}

// Flies the camera to the selected body, then follows it so the visitor can orbit it.
// With nothing selected it returns to the whole system. The intro is a long flight in.
function CameraRig({ selectedId, bodies, controls }) {
  const { camera, size } = useThree();
  const started = useRef(false);
  const tween = useRef(null);
  const pending = useRef(null);
  const goal = useRef(null);
  const lastEnd = useRef(new THREE.Vector3());
  const end = useMemo(() => new THREE.Vector3(), []);
  const endPos = useMemo(() => new THREE.Vector3(), []);
  const delta = useMemo(() => new THREE.Vector3(), []);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    pending.current = { id: selectedId };
  }, [selectedId]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    if (!started.current) {
      started.current = true;
      camera.position.copy(INTRO_FROM);
      c.target.set(0, 0, 0);
      tween.current = { t: 0, dur: 4.2, fromPos: camera.position.clone(), fromTarget: c.target.clone() };
    }
    if (pending.current) {
      goal.current = pending.current.id;
      tween.current = { t: 0, dur: 1.6, fromPos: camera.position.clone(), fromTarget: c.target.clone() };
      pending.current = null;
    }

    const b = goal.current ? bodies.current.get(goal.current) : null;
    if (b && b.obj) {
      b.obj.getWorldPosition(end);
      endPos.copy(end).add(b.offset);
    } else {
      end.set(0, 0, 0);
      endPos.copy(size.width < 520 ? OVERVIEW_NARROW : OVERVIEW_OFFSET);
    }

    const tw = tween.current;
    if (tw) {
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = tw.t < 0.5 ? 4 * tw.t * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 3) / 2;
      c.target.lerpVectors(tw.fromTarget, end, e);
      camera.position.lerpVectors(tw.fromPos, endPos, e);
      if (tw.t >= 1) tween.current = null;
    } else {
      // Follow: carry the camera and its target with the body, keeping the visitor's angle.
      delta.copy(end).sub(lastEnd.current);
      camera.position.add(delta);
      c.target.add(delta);
    }
    lastEnd.current.copy(end);
    c.update();
  });
  return null;
}

export default function WorldScene({ planets, selectedId, onSelect }) {
  const [hoverId, setHoverId] = useState(null);
  const bodies = useRef(new Map());
  const controls = useRef();

  const palette = useMemo(() => {
    const byToken = {};
    for (const p of planets) byToken[p.token] = new THREE.Color(resolveTokenColor(`var(${p.token})`));
    return {
      sky: new THREE.Color(resolveTokenColor('var(--color-ink)')),
      sun: new THREE.Color(resolveTokenColor('var(--color-accent)')).lerp(WHITE, 0.12),
      dust: new THREE.Color(resolveTokenColor('var(--color-cyan)')),
      byToken,
    };
  }, [planets]);
  const glow = useMemo(() => glowTexture(), []);

  const hover = (id) => {
    document.body.style.cursor = id ? 'pointer' : '';
    setHoverId(id);
  };

  // The system spans about 30 units. A phone-width canvas gets a wider lens so the
  // outer planets are not cropped. Browser-only: the scene is a client-only lazy import.
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;

  return (
    <Canvas
      camera={{ position: [0, 60, 120], fov: narrow ? 56 : 46 }}
      dpr={[1, 2]}
      role="img"
      aria-label="A night-sky orrery of the estate: a sun, a planet for each mechanism family on its own orbit, and a moon for each record."
      onPointerMissed={() => onSelect(null)}
      onCreated={({ gl, scene }) => { gl.setClearColor(palette.sky, 1); scene.background = palette.sky; }}
    >
      <ambientLight intensity={0.22} />
      <Stars radius={150} depth={70} count={5200} factor={4.2} saturation={0} fade speed={0.5} />
      <Sparkles count={260} scale={[34, 3.5, 34]} size={2.4} speed={0.12} color={palette.dust} opacity={0.6} raycast={() => null} />
      <Glow texture={glow} color={palette.dust} size={70} opacity={0.06} />
      <group scale={narrow ? NARROW_LAYOUT : 1}>
        <Sun color={palette.sun} glow={glow} />
        {planets.map((p, i) => (
          <Planet
            key={p.id}
            planet={p}
            index={i}
            base={palette.byToken[p.token]}
            glow={glow}
            selectedId={selectedId}
            hoverId={hoverId}
            compact={narrow}
            onSelect={onSelect}
            onHover={hover}
            bodies={bodies}
          />
        ))}
      </group>
      <OrbitControls
        ref={controls}
        enablePan={false}
        enableDamping
        dampingFactor={0.07}
        minDistance={3}
        maxDistance={80}
        rotateSpeed={0.6}
        zoomSpeed={0.8}
      />
      <CameraRig selectedId={selectedId} bodies={bodies} controls={controls} />
      {/* Only the brightest pixels bloom: the sun and its corona, not every moon. */}
      <EffectComposer multisampling={0} frameBufferType={THREE.UnsignedByteType}>
        <Bloom intensity={1.1} luminanceThreshold={0.5} luminanceSmoothing={0.25} />
      </EffectComposer>
    </Canvas>
  );
}

// ponytail: every moon is a sphere and every planet a banded texture. Dozens of records
// per planet read as a crowd, not as individual things, and there is no level-of-detail.
// Upgrade path: instance the moons with THREE.InstancedMesh, and label by distance.
