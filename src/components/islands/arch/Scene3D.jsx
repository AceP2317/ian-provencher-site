// The 3D scene (react-three-fiber). Lazy-loaded, so three/drei only download on an
// architecture detail page and only when the capability gate picks 3D. Nodes sit on
// depth planes by kind and are spread within them by their rank in the actual graph;
// edges arc between them carrying flow packets coloured by what they carry; the camera
// reframes the active walkthrough step. Colours are resolved from the CSS design tokens
// at mount (WebGL can't read var()). Node selection drives the shared inspector.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { KIND_COLOR, KIND_ORDER, FLOW_COLOR, topoRanks, inferFlow } from './shared.jsx';
import { Bloom, StudioEnv } from './postfx.jsx';

const PX = 1 / 12; // 0–100 space → world units

// The kind plane is genuinely semantic — operator at the front, external at the back,
// following the flow of work. What it CANNOT do alone is separate two nodes of the same
// kind, and that was the whole problem: every same-kind node landed on an identical z, so
// the scene was six flat parallel sheets. Rank (see topoRanks) spreads nodes within their
// plane by where they actually sit in the graph.
const kindZ = (kind) => (2.5 - KIND_ORDER.indexOf(kind)) * 1.0;

// Resolve a `var(--token)` expression to its computed hex, once, at mount.
function resolveVar(expr, fallback = '#888888') {
  const m = /var\((--[\w-]+)\)/.exec(expr || '');
  if (!m) return expr || fallback;
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

function NodeGeom({ kind, size }) {
  switch (kind) {
    case 'operator': return <icosahedronGeometry args={[size, 0]} />;
    case 'surface': return <boxGeometry args={[size * 1.7, size * 1.15, size * 0.45]} />;
    case 'engine': return <boxGeometry args={[size * 1.25, size * 1.25, size * 1.25]} />;
    case 'agent': return <octahedronGeometry args={[size, 0]} />;
    case 'store': return <cylinderGeometry args={[size * 0.9, size * 0.9, size * 1.3, 24]} />;
    default: return <torusGeometry args={[size * 0.8, size * 0.3, 12, 24]} />;
  }
}

function Node({ n, pos, color, on, selected, onSelect, reduced }) {
  const ref = useRef();
  const [hovered, setHovered] = useState(false);

  const w = n.weight ? Math.max(0.7, Math.min(1.6, n.weight)) : 1;
  const size = 0.34 * w;

  // The cursor is the only thing on screen telling a visitor a mesh is clickable — there
  // was no hover state of any kind in either 3D scene before this. Reset on unmount too,
  // or a fast un-mount mid-hover strands the whole document in `cursor: pointer`.
  useEffect(() => {
    if (!on) return undefined;
    document.body.style.cursor = hovered ? 'pointer' : '';
    return () => { document.body.style.cursor = ''; };
  }, [hovered, on]);

  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const bob = reduced ? 0 : Math.sin(state.clock.elapsedTime * 1.2 + pos[0] * 2) * 0.025;
    m.position.set(pos[0], pos[1] + bob, pos[2]);
    const target = selected ? 1.32 : hovered && on ? 1.14 : 1;
    m.scale.x += (target - m.scale.x) * 0.15;
    m.scale.y = m.scale.z = m.scale.x;
  });

  // Emissive is what the bloom pass keys off, so the hover reads as the node ENERGISING
  // rather than merely tinting. Threshold sits below `on` (0.5) and above the dimmed
  // off-step state (0.08), so dimmed nodes never glow.
  const emissive = selected ? 1.15 : hovered && on ? 0.85 : on ? 0.45 : 0.06;

  return (
    <group>
      <mesh
        ref={ref}
        position={pos}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <NodeGeom kind={n.kind} size={size} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissive}
          transparent
          // Off-step nodes recede rather than vanish. At the old 0.16 they were
          // essentially invisible, which read as broken rather than as de-emphasised.
          opacity={on ? 1 : 0.28}
          roughness={0.3}
          metalness={0.45}
        />
      </mesh>
      <Html
        position={[pos[0], pos[1] + size + 0.22, pos[2]]}
        center
        distanceFactor={8}
        zIndexRange={[20, 0]}
        style={{ pointerEvents: on ? 'auto' : 'none' }}
      >
        <button
          className="arch3d-label"
          aria-pressed={selected}
          aria-label={`${n.label}${n.detail ? ' — details' : ''}`}
          onClick={onSelect}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          /* NO `outline` here. This is a focusable <button>, and an inline style beats
             `:focus-visible` on precedence — so an inline `outline: none` (which is what the
             un-selected branch used to be) left every 3D node label a keyboard target with
             NO focus indicator at all. `outline` is now owned solely by :focus-visible;
             selection is expressed through the box-shadow instead, which nothing else claims.
             The base elevation is re-declared in every branch because box-shadow does not
             merge — omitting it would drop the label's lift the moment it is hovered. */
          style={{
            borderColor: color,
            opacity: on ? 1 : 0.3,
            boxShadow: selected
              ? `0 0 0 1px ${color}, 0 0 18px -4px ${color}, var(--elev-1)`
              : hovered && on
                ? `0 0 14px -2px ${color}, var(--elev-1)`
                : 'var(--elev-1)',
          }}
        >
          <span className="arch3d-dot" style={{ background: color }} />
          {n.label}
        </button>
      </Html>
    </group>
  );
}

/**
 * A curved, directional edge.
 *
 * The old version was a straight `<Line lineWidth={1}>` at 0.5 opacity — on a dark canvas
 * that is very nearly invisible, and with no arrowhead the 3D scene lost the direction
 * information the 2D one has (the SVG has markers; the 3D scene had none). Arcs also stop
 * parallel runs from overlapping into a single ambiguous stroke, and give the eye
 * something to read depth from.
 */
function Edge({ curve, on, color, reduced, phase }) {
  const packet = useRef();

  const points = useMemo(() => curve.getPoints(28), [curve]);

  // The arrowhead: sit near the target end and orient along the curve's tangent there.
  // A cone's axis is +Y, so rotate that onto the tangent.
  const arrow = useMemo(() => {
    const at = curve.getPointAt(0.9);
    const tangent = curve.getTangentAt(0.9).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    return { position: at, quaternion: q };
  }, [curve]);

  useFrame((state) => {
    const p = packet.current;
    if (!p) return;
    const t = (state.clock.elapsedTime * 0.35 + phase) % 1;
    p.position.copy(curve.getPointAt(t));
  });

  return (
    <group>
      <Line
        points={points}
        color={color}
        lineWidth={on ? 2 : 1}
        transparent
        opacity={on ? 0.75 : 0.1}
      />

      <mesh position={arrow.position} quaternion={arrow.quaternion}>
        <coneGeometry args={[0.055, 0.16, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={on ? 1.1 : 0.1}
          transparent
          opacity={on ? 1 : 0.15}
          toneMapped={false}
        />
      </mesh>

      {on && !reduced && (
        <mesh ref={packet}>
          <sphereGeometry args={[0.055, 12, 12]} />
          {/* toneMapped={false} keeps this above the bloom threshold so the packet is a
              genuine travelling spark rather than a grey dot. This was already here —
              it just had no bloom pass to land in. */}
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/**
 * The camera rig.
 *
 * The old CameraFocus lerped ONLY `controls.target`, so stepping through a walkthrough
 * re-aimed the camera but never moved it — the guided tour, which is the best narrative
 * asset in this whole section, had almost no visual payoff. This dollies as well: it eases
 * the camera to a distance that actually FRAMES the active step's nodes.
 *
 * Two rules keep it from feeling like a hijacked camera:
 *   · it only engages when the step/selection changes (not every frame, forever), and
 *   · it releases IMMEDIATELY when the user touches the controls, so a manual zoom or
 *     orbit is never fought. Their orbit angle is preserved regardless — only the
 *     distance along the current view direction is adjusted.
 */
function CameraRig({ controls, target, spread, reduced }) {
  const { camera } = useThree();
  const engaged = useRef(false);
  const targetVec = useMemo(() => new THREE.Vector3(...target), [target]);

  // Frame the active set: tighter on a focused step, wider on the overview.
  const distance = useMemo(
    () => Math.min(13, Math.max(5, spread * 2.4 + 3.6)),
    [spread],
  );

  useEffect(() => { engaged.current = true; }, [target, spread]);

  // The user grabbing the controls always wins.
  useEffect(() => {
    const ctl = controls.current;
    if (!ctl) return undefined;
    const release = () => { engaged.current = false; };
    ctl.addEventListener('start', release);
    return () => ctl.removeEventListener('start', release);
  }, [controls]);

  useFrame(() => {
    const ctl = controls.current;
    if (!ctl || !ctl.target) return;

    const k = reduced ? 1 : 0.06;
    ctl.target.lerp(targetVec, k);

    if (engaged.current) {
      const dir = camera.position.clone().sub(ctl.target);
      const current = dir.length() || 1;
      dir.normalize();
      const want = ctl.target.clone().addScaledVector(dir, distance);
      camera.position.lerp(want, k);
      if (Math.abs(current - distance) < 0.03) engaged.current = false;
    }

    ctl.update();
  });

  return null;
}

export default function Scene3D({ c, reduced }) {
  const { arch, nodeById, active, selected, selectNode, nodeOn, edgeOn } = c;
  const controls = useRef();

  // Resolve tokens once at mount into plain hex the WebGL materials can use.
  const palette = useMemo(() => {
    const kind = {};
    for (const k of KIND_ORDER) kind[k] = resolveVar(KIND_COLOR[k]);
    return {
      kind,
      canvas: resolveVar('var(--color-canvas)', '#0f1117'),
      grid: resolveVar('var(--color-line)', '#262c3a'),
      edge: resolveVar('var(--color-ink-faint)', '#838b9e'),
      flow: {
        data: resolveVar(FLOW_COLOR.data),
        control: resolveVar(FLOW_COLOR.control),
        event: resolveVar(FLOW_COLOR.event),
      },
    };
    // THE INVARIANT: the design tokens cannot change at runtime on this site. `html` is
    // hard-set to `color-scheme: dark`, there is not one `prefers-color-scheme` rule in
    // src/, and there is no theme switcher — so an empty dep array is CORRECT, not a bug.
    // Re-resolving would mean a MutationObserver plus a materials-update path built for a
    // feature that does not exist.
    // UPGRADE PATH: if a theme switcher ever lands, re-resolve here on the theme signal AND
    // re-key the <Canvas> — three caches the resolved colours inside its materials, so a new
    // palette object alone will not repaint an already-mounted scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const positions = useMemo(() => {
    const nodes = [...nodeById.values()];
    const ranks = topoRanks(nodes, arch.edges);
    const values = [...ranks.values()];
    const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);

    const m = new Map();
    for (const n of nodes) {
      // An explicit `z` in the data always wins — the day the CCOS records author one,
      // this derived depth stops being consulted.
      const z = n.z != null ? n.z : kindZ(n.kind) + (ranks.get(n.id) - mean) * 0.45;
      m.set(n.id, [(n.x - 50) * PX, (50 - n.y) * PX, z]);
    }
    return m;
  }, [nodeById, arch.edges]);

  // Arc every edge once. Curves are static, so this never recomputes per frame.
  const curves = useMemo(() => {
    return arch.edges.map((e, i) => {
      const a = positions.get(e.from);
      const b = positions.get(e.to);
      if (!a || !b) return null;
      const A = new THREE.Vector3(...a);
      const B = new THREE.Vector3(...b);
      const dir = B.clone().sub(A);
      const len = dir.length() || 1;
      // Bow the arc perpendicular to the run, alternating side by index so that parallel
      // edges fan apart instead of stacking into one ambiguous stroke.
      const perp = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
      const mid = A.clone().add(B).multiplyScalar(0.5)
        .addScaledVector(perp, (i % 2 === 0 ? 1 : -1) * len * 0.1);
      mid.z += 0.2;
      return new THREE.QuadraticBezierCurve3(A, mid, B);
    });
  }, [arch.edges, positions]);

  // Ground sits just below the lowest node, so the rig reads as PLACED rather than as
  // floating in an untextured void. The setup exhibit already had a floor; this scene had
  // nothing to anchor against at all.
  const groundY = useMemo(() => {
    const ys = [...positions.values()].map((p) => p[1]);
    return (ys.length ? Math.min(...ys) : 0) - 1.15;
  }, [positions]);

  const centroid = useMemo(() => {
    const ids = active ? [...active.nodes] : [...nodeById.keys()];
    let x = 0, y = 0, z = 0, k = 0;
    for (const id of ids) { const p = positions.get(id); if (p) { x += p[0]; y += p[1]; z += p[2]; k++; } }
    return k ? [x / k, y / k, z / k] : [0, 0, 0];
  }, [active, nodeById, positions]);

  // How far the active nodes spread — drives how far back the camera needs to sit.
  const spread = useMemo(() => {
    const ids = active ? [...active.nodes] : [...nodeById.keys()];
    let max = 0;
    for (const id of ids) {
      const p = positions.get(id);
      if (!p) continue;
      max = Math.max(max, Math.hypot(p[0] - centroid[0], p[1] - centroid[1], p[2] - centroid[2]));
    }
    return max;
  }, [active, nodeById, positions, centroid]);

  // Idle = nobody is reading anything in particular. A slow drift is what makes the setup
  // exhibit read as alive; this scene sat dead still until dragged. Never under reduced motion.
  const idle = !active && selected == null && !reduced;

  return (
    /* panel--flat: an opaque WebGL canvas fills this box edge to edge, so a
       backdrop-filter behind it blurs nothing and costs a re-raster for free. */
    <div className="arch3d-canvas panel panel--flat">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [2.6, 2.2, 7.5], fov: 45 }}
        onPointerMissed={() => selectNode(selected)} // click empty space → toggle off current
      >
        <color attach="background" args={[palette.canvas]} />
        <fog attach="fog" args={[palette.canvas, 10, 24]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 6, 5]} intensity={0.75} />
        <directionalLight position={[-6, -2, -4]} intensity={0.2} />
        <StudioEnv />

        <gridHelper
          args={[40, 40, palette.grid, palette.grid]}
          position={[0, groundY, 0]}
        />

        {arch.edges.map((e, i) => {
          const curve = curves[i];
          if (!curve) return null;
          const flow = inferFlow(e, nodeById);
          return (
            <Edge
              key={i}
              curve={curve}
              on={edgeOn(e)}
              color={palette.flow[flow] || palette.edge}
              reduced={reduced}
              phase={(i * 0.37) % 1}
            />
          );
        })}

        {[...nodeById.values()].map((n) => (
          <Node
            key={n.id}
            n={n}
            pos={positions.get(n.id)}
            color={palette.kind[n.kind] || palette.edge}
            on={nodeOn(n.id)}
            selected={selected === n.id}
            onSelect={() => selectNode(n.id)}
            reduced={reduced}
          />
        ))}

        <OrbitControls
          ref={controls}
          makeDefault
          enableDamping={!reduced}
          dampingFactor={0.08}
          autoRotate={idle}
          autoRotateSpeed={0.45}
          minDistance={4}
          maxDistance={16}
          maxPolarAngle={Math.PI * 0.92}
          minPolarAngle={Math.PI * 0.08}
          enablePan={false}
        />
        <CameraRig controls={controls} target={centroid} spread={spread} reduced={reduced} />

        {/* Must come last: it takes over the render loop (positive useFrame priority). */}
        <Bloom />
      </Canvas>
    </div>
  );
}
