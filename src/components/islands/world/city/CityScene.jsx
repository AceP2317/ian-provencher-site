// The city as a place to stand in. Physics (Rapier) holds the buildings, the fences, the car, the crates and
// the door; the look sets only colours, lights and post-processing. Everything that moves in the replay is
// painted from one clock value, so the clock can run fast or rewind. Readouts are written to DOM nodes the
// browser walk and the screen reader both read.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, useGLTF, useTexture } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider, CapsuleCollider } from '@react-three/rapier';
import { EffectComposer, Bloom, SSAO } from '@react-three/postprocessing';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { resolveTokenColor } from '../../arch/shared.jsx';
import { PITCH, furnitureSpots, lampSpots } from './layout.js';
import { hash } from '../shared/noise.js';
import { Car, Person } from './props.jsx';
import { advanceSimT, formatSimTime } from './clock.js';
import { replayAt, signature } from './replay.js';
import { BOARD_RANGE, INTERACT_RANGE, driveStep, gateInRange, nearestBuilding, pickLabels, walkVelocity } from './player.js';
import { FrameProbe, detailFor, nextAfterSlow, startingLevel } from './quality.js';

const EYE = 0.5;
const SPAWN_Y = 1.2;
const PARK = { x: 0, y: -200, z: 0 };
const ZERO = { x: 0, y: 0, z: 0 };
const EDGE_MARGIN = 40;
const DOOR_RANGE = 2.5;
const DOOR_RATE = 3;
const LOOK_YAW = 2.2;
const LOOK_PITCH = 1.6;
const PITCH_LIMIT = 1.2;
const SUN_OFFSET = [60, 90, 30];
const SHADOW_HALF = 75;
const LABEL_RANGE = 30;
const LABEL_MAX = 3;
const LABEL_GAP = 14;
const NEAR_EVERY = 30;

function colourOf(token) {
  return new THREE.Color(resolveTokenColor(`var(${token})`));
}

function paletteFor(look) {
  return {
    sky: colourOf(look.sky),
    ground: colourOf(look.ground),
    plot: colourOf(look.plot),
    windowGlow: colourOf(look.windowGlow),
    pulse: colourOf(look.pulse),
    edge: colourOf(look.edge),
    car: colourOf(look.car),
    walker: colourOf(look.walker),
    rain: colourOf(look.rain),
    grid: colourOf(look.grid),
    tint: colourOf(look.tint),
    sun: colourOf(look.sunColour),
    lane: colourOf(look.lane),
  };
}

const BUILDING_MODELS = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h'];
const TOWER_MODELS = ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c'];
const TOWER_HEIGHT = 14;

// Each building wears one of the bundled CC0 city models, scaled to its footprint and height. The same
// building always gets the same model, so the city does not reshuffle between visits.
// The models' windows are one swatch of the shared colour texture; this mask (written from that swatch)
// marks them, so only the windows take the emissive light.
function CityModel({ b, pal, phone, look, onWindows }) {
  const pool = b.h >= TOWER_HEIGHT ? TOWER_MODELS : BUILDING_MODELS;
  const gltf = useGLTF(`/world-city/${pool[hash(b.id) % pool.length]}.glb`);
  const mask = useTexture('/world-city/Textures/windows.png');
  mask.flipY = false;
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    return { size: box.getSize(new THREE.Vector3()), centre: box.getCenter(new THREE.Vector3()), minY: box.min.y };
  }, [gltf]);
  const { model, mats } = useMemo(() => {
    const o = gltf.scene.clone(true);
    const list = [];
    o.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      m.material.color.copy(pal.tint);
      m.material.emissiveMap = mask;
      m.material.emissive.copy(pal.windowGlow);
      m.material.emissiveIntensity = look.winGlow[0] * b.glow;
      m.castShadow = !phone;
      m.receiveShadow = true;
      list.push(m.material);
    });
    return { model: o, mats: list };
  }, [gltf, mask, pal, phone, look, b.glow]);
  useEffect(() => {
    onWindows(mats);
  }, [mats, onWindows]);
  return (
    <group position={[b.x, 0, b.z]} scale={[b.w / fit.size.x, b.h / fit.size.y, b.d / fit.size.z]}>
      <primitive object={model} position={[-fit.centre.x, -fit.minY, -fit.centre.z]} />
    </group>
  );
}

// A building's body is its physics box. Only the scheduled jobs carry a flashing beacon, because only
// their light follows a real cadence.
function Building({ b, look, pal, phone, matRef, onWindows }) {
  return (
    <>
      <RigidBody type="fixed" colliders={false} position={[b.x, b.h / 2, b.z]}>
        <CuboidCollider args={[b.w / 2, b.h / 2, b.d / 2]} />
      </RigidBody>
      <mesh position={[b.x, 0.03, b.z]} receiveShadow>
        <boxGeometry args={[b.w + 1.2, 0.06, b.d + 1.2]} />
        <meshStandardMaterial color={pal.plot} roughness={1} />
      </mesh>
      <CityModel b={b} pal={pal} phone={phone} look={look} onWindows={onWindows} />
      {b.period > 0 && (
        <mesh position={[b.x, b.h + 0.8, b.z]}>
          <boxGeometry args={[0.9, 0.9, 0.9]} />
          <meshStandardMaterial ref={matRef} color={pal.pulse} emissive={pal.windowGlow} emissiveIntensity={look.glow} />
        </mesh>
      )}
    </>
  );
}

function Director({ city, look, pal, detail, input, sim, dom, refs, probe, sunTarget, audio, onSlow, onNearest, onInteract, onLabels, onGate }) {
  const { camera, scene, gl } = useThree();
  const env = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    return tex;
  }, [gl]);
  const rig = useRef({
    mode: 'walk',
    yaw: city.spawn.yaw,
    pitch: 0.12,
    speed: 0,
    heading: city.vehicle.heading,
    nearest: null,
    door: 0,
    frames: 0,
    lastSec: -1,
    labelKey: '',
    gateKey: null,
  });
  const tmp = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    scene.background = pal.sky;
    scene.fog = look.fog ? new THREE.Fog(pal.sky, look.fog[0], look.fog[1]) : null;
    scene.environment = env;
    scene.environmentIntensity = look.env;
  }, [scene, pal, look, env]);

  useFrame((_, dt) => {
    const r = rig.current;
    const player = refs.player.current;
    const vehicle = refs.vehicle.current;
    if (!player || !vehicle) return;
    const h = Math.min(dt, 0.1);
    if (probe.current.push(dt)) onSlow();
    const inp = input.current;

    sim.t = advanceSimT(sim.t, h, sim.rate);
    const replay = replayAt(sim.t, city);

    const k = replay.daylight;
    if (refs.ambient.current) refs.ambient.current.intensity = look.ambient[0] + (look.ambient[1] - look.ambient[0]) * k;
    if (refs.sun.current) refs.sun.current.intensity = look.sun[0] + (look.sun[1] - look.sun[0]) * k;

    const pp0 = player.translation();
    if (refs.sun.current) refs.sun.current.position.set(pp0.x + SUN_OFFSET[0], SUN_OFFSET[1], pp0.z + SUN_OFFSET[2]);
    if (sunTarget) sunTarget.position.set(pp0.x, 0, pp0.z);

    city.buildings.forEach((b, i) => {
      const lit = replay.lit[i] === 1;
      const m = refs.mats.current[i];
      if (m) {
        m.emissive.copy(lit ? pal.pulse : pal.windowGlow);
        m.emissiveIntensity = (lit ? look.pulseGlow : look.glow) * b.glow;
      }
      const wins = refs.windows.current[i];
      if (wins) {
        for (const wm of wins) wm.emissiveIntensity = (lit ? look.winGlow[1] : look.winGlow[0]) * b.glow;
      }
    });
    replay.cars.forEach((c, i) => {
      const el = refs.cars.current[i];
      if (!el) return;
      el.visible = i < detail.cars;
      el.position.set(c.x, 0, c.z);
    });
    replay.walkers.forEach((w, i) => {
      const el = refs.walkers.current[i];
      if (!el) return;
      el.visible = i < detail.walkers;
      el.position.set(w.x, 0, w.z);
      const limbs = refs.limbs.current[i];
      if (limbs) {
        const s = Math.sin(w.stride);
        limbs.legL.rotation.x = s * 0.6;
        limbs.legR.rotation.x = -s * 0.6;
        limbs.armL.rotation.x = -s * 0.5;
        limbs.armR.rotation.x = s * 0.5;
      }
    });
    const rain = refs.rain.current;
    if (rain) {
      const showing = replay.rain > 0.02 && detail.rainDrops > 0;
      rain.visible = showing;
      if (showing) {
        for (let i = 0; i < detail.rainDrops; i++) {
          const drop = city.rain[i];
          tmp.position.set(pp0.x + drop.dx, replay.dropY[i], pp0.z + drop.dz);
          tmp.updateMatrix();
          rain.setMatrixAt(i, tmp.matrix);
        }
        rain.instanceMatrix.needsUpdate = true;
        rain.material.opacity = 0.15 + 0.4 * replay.rain;
      }
    }

    if (inp.keys.ArrowLeft) r.yaw += LOOK_YAW * h;
    if (inp.keys.ArrowRight) r.yaw -= LOOK_YAW * h;
    if (inp.keys.ArrowUp) r.pitch += LOOK_PITCH * h;
    if (inp.keys.ArrowDown) r.pitch -= LOOK_PITCH * h;
    r.yaw -= inp.look.dx * 0.0025;
    r.pitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, r.pitch - inp.look.dy * 0.002));
    inp.look.dx = 0;
    inp.look.dy = 0;

    const use = () => {
      if (r.mode === 'walk') {
        const p = player.translation();
        const vp = vehicle.translation();
        if (Math.hypot(p.x - vp.x, p.z - vp.z) <= BOARD_RANGE) {
          r.mode = 'drive';
          r.speed = 0;
          dom.mode.current.dataset.mode = 'drive';
        } else if (r.nearest) {
          onInteract(r.nearest);
        }
      } else {
        const vp = vehicle.translation();
        const sideX = Math.cos(r.heading);
        const sideZ = -Math.sin(r.heading);
        player.setTranslation({ x: vp.x + sideX * 2.4, y: SPAWN_Y + 0.3, z: vp.z + sideZ * 2.4 }, true);
        player.setLinvel(ZERO, true);
        r.mode = 'walk';
        dom.mode.current.dataset.mode = 'walk';
      }
    };
    while (inp.pressed.length) {
      inp.pressed.shift();
      use();
    }

    if (inp.travel) {
      const spot = city.districts.find((d) => d.id === inp.travel)?.travel;
      inp.travel = null;
      if (spot) {
        if (r.mode === 'drive') {
          r.mode = 'walk';
          dom.mode.current.dataset.mode = 'walk';
        }
        player.setTranslation({ x: spot.x, y: SPAWN_Y, z: spot.z }, true);
        player.setLinvel(ZERO, true);
        r.yaw = Math.PI / 2;
      }
    }

    vehicle.setRotation({ x: 0, y: Math.sin(r.heading / 2), z: 0, w: Math.cos(r.heading / 2) }, true);
    const fx = -Math.sin(r.heading);
    const fz = -Math.cos(r.heading);
    const vLin = vehicle.linvel();
    let p;
    if (r.mode === 'walk') {
      const v = walkVelocity(inp, r.yaw);
      const lv = player.linvel();
      player.setLinvel({ x: v.x, y: lv.y, z: v.z }, true);
      p = player.translation();
      // ponytail: a walker pushing into the car hands the car its own velocity, rather than a contact impulse
      // from the solver, which moved the car only a few centimetres. Upgrade path: tune the car's mass and let
      // the solver transfer momentum.
      const vpos = vehicle.translation();
      const tx = vpos.x - p.x;
      const tz = vpos.z - p.z;
      const td = Math.hypot(tx, tz);
      if (td > 0.01 && td < 2.4 && v.x * tx + v.z * tz > 0) {
        const vl = vehicle.linvel();
        vehicle.setLinvel({ x: v.x * 0.9, y: vl.y, z: v.z * 0.9 }, true);
      }
      camera.position.set(p.x, p.y + EYE, p.z);
      camera.rotation.set(r.pitch, r.yaw, 0, 'YXZ');
    } else {
      player.setTranslation(PARK, true);
      player.setLinvel(ZERO, true);
      const ds = driveStep({ speed: r.speed, heading: r.heading }, inp, h);
      r.speed = ds.speed;
      r.heading = ds.heading;
      vehicle.setLinvel({ x: fx * r.speed, y: vLin.y, z: fz * r.speed }, true);
      const vp = vehicle.translation();
      camera.position.set(vp.x - fx * 7, vp.y + 3, vp.z - fz * 7);
      camera.lookAt(vp.x, vp.y + 1, vp.z);
      p = vp;
    }
    audio.current.rain = replay.rain;
    audio.current.driving = r.mode === 'drive';
    audio.current.speed = Math.abs(r.speed);

    const door = city.door;
    const doorBody = refs.door.current;
    if (door && doorBody) {
      const pp = player.translation();
      const near = Math.hypot(pp.x - door.x, pp.z - door.z) <= DOOR_RANGE;
      const target = near ? 1 : 0;
      r.door += (target - r.door) * Math.min(1, DOOR_RATE * h);
      doorBody.setNextKinematicTranslation({ x: door.x, y: door.base + r.door * door.lift, z: door.z });
    }

    const nearHit = nearestBuilding(p.x, p.z, city.buildings, INTERACT_RANGE);
    const id = nearHit ? nearHit.building.id : null;
    if (id !== r.nearest) {
      r.nearest = id;
      onNearest(id);
    }

    if (r.frames % NEAR_EVERY === 0) {
      const at = player.translation();
      const gates = city.districts.map((d) => ({ id: d.id, ...d.gate }));
      const near = pickLabels(city.buildings, at, { range: LABEL_RANGE, cap: LABEL_MAX, minGap: LABEL_GAP, reserved: gates });
      const key = near.join('|');
      if (key !== r.labelKey) {
        r.labelKey = key;
        onLabels(near);
      }
      const gate = gateInRange(at, gates);
      if (gate !== r.gateKey) {
        r.gateKey = gate;
        onGate(gate);
      }
    }

    const pp = player.translation();
    const vp = vehicle.translation();
    const sec = Math.floor(sim.t);
    if (dom.pos.current) {
      dom.pos.current.dataset.x = pp.x.toFixed(3);
      dom.pos.current.dataset.z = pp.z.toFixed(3);
    }
    if (dom.veh.current) {
      dom.veh.current.dataset.x = vp.x.toFixed(3);
      dom.veh.current.dataset.z = vp.z.toFixed(3);
    }
    if (sec !== r.lastSec) {
      r.lastSec = sec;
      if (dom.sim.current) {
        dom.sim.current.textContent = formatSimTime(sim.t);
        dom.sim.current.dataset.t = String(sec);
      }
    }
    r.frames += 1;
    if (dom.sig.current) dom.sig.current.dataset.sig = String(signature(replay));
    if (!r.ready && dom.ready.current) {
      r.ready = true;
      dom.ready.current.dataset.ready = '1';
    }
  });

  return null;
}

// Draws the spots nearest the player, up to a count, from a set of instanced parts. The order is
// re-sorted every thirty frames, so a dense city costs what a single district does.
// ponytail: the set is chosen by distance alone, so an object can pop in or out at the edge of its range. Upgrade path: fade each object over the last few metres of its range.
function NearInstances({ spots, count, parts, playerRef }) {
  const meshes = useRef([]);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const frame = useRef(0);
  const max = Math.max(1, spots.length);
  useEffect(() => {
    for (const m of meshes.current) if (m) m.count = 0;
  }, []);
  useFrame(() => {
    const due = frame.current % NEAR_EVERY === 0;
    frame.current += 1;
    if (!due) return;
    const p = playerRef.current?.translation();
    if (!p) return;
    const n = Math.min(count, spots.length);
    const order = spots
      .map((s, i) => ({ i, d: (s.x - p.x) ** 2 + (s.z - p.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, n);
    parts.forEach((part, k) => {
      const mesh = meshes.current[k];
      if (!mesh) return;
      order.forEach((o, slot) => {
        const s = spots[o.i];
        tmp.position.set(s.x, part.y, s.z);
        tmp.updateMatrix();
        mesh.setMatrixAt(slot, tmp.matrix);
      });
      mesh.count = order.length;
      mesh.instanceMatrix.needsUpdate = true;
    });
  });
  return (
    <>
      {parts.map((part, k) => (
        <instancedMesh key={k} ref={(el) => { meshes.current[k] = el; }} args={[undefined, undefined, max]} frustumCulled={false}>
          {part.geom}
          {part.mat}
        </instancedMesh>
      ))}
    </>
  );
}

function BuildingLabel({ b }) {
  return (
    <Html
      position={[b.x, b.h + 2.6, b.z]}
      center
      zIndexRange={[10, 0]}
      className="pointer-events-none whitespace-nowrap rounded bg-canvas/90 px-2 py-0.5 font-mono text-[0.7rem] text-ink"
    >
      <span aria-hidden="true" data-world="label">
        {b.label}
      </span>
    </Html>
  );
}

function GateBoard({ d, pal, showLabel }) {
  return (
    <group position={[d.gate.x, 0, d.gate.z]}>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[x, 1.1, 0]} castShadow>
          <boxGeometry args={[0.12, 2.2, 0.12]} />
          <meshStandardMaterial color={pal.plot} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 2.3, 0]}>
        <boxGeometry args={[2.2, 0.7, 0.1]} />
        <meshStandardMaterial color={pal.edge} emissive={pal.edge} emissiveIntensity={0.8} />
      </mesh>
      {showLabel && (
        <Html position={[0, 3.1, 0]} center zIndexRange={[10, 0]} className="pointer-events-none whitespace-nowrap font-display text-sm font-semibold text-ink">
          <span data-world="gate" data-id={d.id} className="rounded bg-canvas/90 px-2 py-0.5">
            {d.label}, {d.count} buildings
          </span>
        </Html>
      )}
    </group>
  );
}

// Lines down each street, so the roads read as roads rather than an open floor. The avenue runs through
// every district's first street and across the gaps between them.
function Lanes({ city, pal }) {
  const B = city.bounds;
  const bars = [{ x: (B.minX + B.maxX) / 2, z: PITCH / 2, sx: B.maxX - B.minX, sz: 0.2 }];
  for (const d of city.districts) {
    const { minX, maxX, minZ, maxZ } = d.bounds;
    for (let k = 1; k < d.rows; k++) bars.push({ x: (minX + maxX) / 2, z: k * PITCH + PITCH / 2, sx: maxX - minX, sz: 0.2 });
    for (let c = -1; c < d.cols; c++) bars.push({ x: d.x0 + c * PITCH + PITCH / 2, z: (minZ + maxZ) / 2, sx: 0.2, sz: maxZ - minZ });
  }
  return (
    <>
      {bars.map((b, i) => (
        <mesh key={i} position={[b.x, 0.05, b.z]}>
          <boxGeometry args={[b.sx, 0.02, b.sz]} />
          <meshBasicMaterial color={pal.lane} />
        </mesh>
      ))}
    </>
  );
}

export default function CityScene({ city, look, input, sim, dom, phone, audio, onNearest, onInteract, onGiveUp }) {
  const pal = useMemo(() => paletteFor(look), [look]);
  const [state, setState] = useState(() => ({ level: startingLevel(phone), strikes: 0, giveUp: false }));
  const detail = detailFor(state.level);
  const probe = useRef(new FrameProbe());
  const [labelIds, setLabelIds] = useState([]);
  const [gateId, setGateId] = useState(null);
  const refs = {
    player: useRef(null),
    vehicle: useRef(null),
    door: useRef(null),
    ambient: useRef(null),
    sun: useRef(null),
    rain: useRef(null),
    mats: useRef([]),
    cars: useRef([]),
    walkers: useRef([]),
    windows: useRef([]),
    limbs: useRef([]),
  };
  const spots = useMemo(() => lampSpots(city), [city]);
  const furniture = useMemo(() => furnitureSpots(city), [city]);
  const byId = useMemo(() => new Map(city.buildings.map((b) => [b.id, b])), [city]);
  const limbCallbacks = useMemo(() => city.walkers.map((_, i) => (l) => { refs.limbs.current[i] = l; }), [city]);
  const sunTarget = useMemo(() => new THREE.Object3D(), []);
  const B = city.bounds;
  const cx = (B.minX + B.maxX) / 2;
  const cz = (B.minZ + B.maxZ) / 2;
  const hx = (B.maxX - B.minX) / 2 + EDGE_MARGIN;
  const hz = (B.maxZ - B.minZ) / 2 + EDGE_MARGIN;
  const gridSize = Math.round((2 * Math.max(hx, hz)) / 4) * 4;
  const v = city.vehicle;
  const spawn = city.spawn;
  sunTarget.position.set(cx, 0, cz);

  useEffect(() => {
    if (refs.rain.current) refs.rain.current.count = detail.rainDrops;
  }, [detail.rainDrops]);

  useEffect(() => {
    if (state.giveUp) onGiveUp();
  }, [state.giveUp, onGiveUp]);

  return (
    <Canvas
      dpr={phone ? [1, 1.5] : [1, 2]}
      shadows={!phone}
      camera={{ position: [0, 3, 0], fov: phone ? 66 : 58, near: 0.05, far: 700 }}
      gl={{ antialias: true }}
      role="img"
      aria-label="A night city you can walk through: five districts of buildings, one for each record of the estate, with traffic, walkers, a car you can drive, and crates to push."
    >
      <Physics gravity={[0, -9.81, 0]}>
        <ambientLight ref={refs.ambient} intensity={look.ambient[1]} />
        <primitive object={sunTarget} />
        <directionalLight
          ref={refs.sun}
          position={[cx + SUN_OFFSET[0], SUN_OFFSET[1], cz + SUN_OFFSET[2]]}
          target={sunTarget}
          color={pal.sun}
          intensity={look.sun[1]}
          castShadow={!phone}
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-SHADOW_HALF}
          shadow-camera-right={SHADOW_HALF}
          shadow-camera-top={SHADOW_HALF}
          shadow-camera-bottom={-SHADOW_HALF}
          shadow-camera-near={1}
          shadow-camera-far={300}
          shadow-bias={-0.0005}
        />

        <RigidBody type="fixed" colliders={false} position={[cx, -0.5, cz]}>
          <CuboidCollider args={[hx, 0.5, hz]} />
        </RigidBody>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow>
          <planeGeometry args={[hx * 2, hz * 2]} />
          <meshStandardMaterial color={pal.ground} roughness={look.groundRough} />
        </mesh>
        <Lanes city={city} pal={pal} />
        <gridHelper args={[gridSize, gridSize / 4, pal.grid, pal.grid]} position={[cx, 0.02, cz]} />

        {city.fixed
          .filter((f) => f.kind === 'fence')
          .map((f, i) => (
            <RigidBody key={`fence${i}`} type="fixed" colliders={false} position={[f.x, f.y, f.z]}>
              <CuboidCollider args={[f.hx, f.hy, f.hz]} />
              <mesh castShadow receiveShadow>
                <boxGeometry args={[f.hx * 2, f.hy * 2, f.hz * 2]} />
                <meshStandardMaterial color={pal.plot} />
              </mesh>
            </RigidBody>
          ))}

        {city.buildings.map((b, i) => (
          <Building
            key={b.id}
            b={b}
            look={look}
            pal={pal}
            phone={phone}
            onWindows={(mats) => {
              refs.windows.current[i] = mats;
            }}
            matRef={(el) => {
              refs.mats.current[i] = el;
            }}
          />
        ))}

        {city.districts.map((d) => (
          <GateBoard key={d.id} d={d} pal={pal} showLabel={gateId === d.id} />
        ))}

        <NearInstances
          spots={spots}
          count={look.lamps ? detail.lamps : 0}
          playerRef={refs.player}
          parts={[
            { y: 1.6, geom: <boxGeometry args={[0.08, 3.2, 0.08]} />, mat: <meshStandardMaterial color={pal.edge} roughness={0.6} /> },
            {
              y: 3.2,
              geom: <sphereGeometry args={[0.22, 8, 6]} />,
              mat: <meshStandardMaterial color={pal.edge} emissive={pal.edge} emissiveIntensity={3} />,
            },
          ]}
        />
        <NearInstances
          spots={furniture.trees}
          count={detail.trees}
          playerRef={refs.player}
          parts={[
            { y: 0.8, geom: <cylinderGeometry args={[0.12, 0.14, 1.6, 6]} />, mat: <meshStandardMaterial color={pal.plot} /> },
            { y: 2.3, geom: <sphereGeometry args={[0.8, 8, 6]} />, mat: <meshStandardMaterial color={pal.grid} roughness={0.9} /> },
          ]}
        />
        <NearInstances
          spots={furniture.benches}
          count={detail.benches}
          playerRef={refs.player}
          parts={[{ y: 0.25, geom: <boxGeometry args={[1.6, 0.5, 0.5]} />, mat: <meshStandardMaterial color={pal.plot} /> }]}
        />
        <NearInstances
          spots={furniture.bins}
          count={detail.bins}
          playerRef={refs.player}
          parts={[{ y: 0.5, geom: <cylinderGeometry args={[0.3, 0.3, 1.0, 8]} />, mat: <meshStandardMaterial color={pal.plot} /> }]}
        />
        <NearInstances
          spots={furniture.zebra}
          count={furniture.zebra.length}
          playerRef={refs.player}
          parts={[{ y: 0.06, geom: <boxGeometry args={[0.3, 0.03, 3.6]} />, mat: <meshStandardMaterial color={pal.lane} /> }]}
        />

        <RigidBody
          ref={refs.player}
          type="dynamic"
          position={[spawn.x, SPAWN_Y, spawn.z]}
          colliders={false}
          lockRotations
          linearDamping={0.5}
        >
          <CapsuleCollider args={[0.6, 0.35]} friction={0} />
        </RigidBody>

        <RigidBody
          ref={refs.vehicle}
          type="dynamic"
          position={[v.x, v.hy, v.z]}
          colliders={false}
          lockRotations
          linearDamping={1.2}
        >
          <CuboidCollider args={[v.hx, v.hy, v.hz]} />
          <group position={[0, -v.hy, 0]}>
            <Car color={pal.car} lamp={pal.pulse} />
          </group>
        </RigidBody>

        {city.crates.map((c, i) => (
          <RigidBody key={`crate${i}`} type="dynamic" position={[c.x, 0.5, c.z]} colliders={false} linearDamping={0.6}>
            <CuboidCollider args={[0.5, 0.5, 0.5]} />
            <mesh castShadow receiveShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color={pal.walker} />
            </mesh>
          </RigidBody>
        ))}

        {city.door && (
          <RigidBody
            ref={refs.door}
            type="kinematicPosition"
            position={[city.door.x, city.door.base, city.door.z]}
            colliders={false}
          >
            <CuboidCollider args={[city.door.hx, city.door.hy, city.door.hz]} />
            <mesh>
              <boxGeometry args={[city.door.hx * 2, city.door.hy * 2, city.door.hz * 2]} />
              <meshStandardMaterial color={pal.edge} />
            </mesh>
          </RigidBody>
        )}

        {city.traffic.map((_, i) => (
          <group key={`car${i}`} ref={(el) => { refs.cars.current[i] = el; }}>
            <group rotation={[0, Math.PI / 2, 0]}>
              <Car color={pal.car} lamp={pal.pulse} />
            </group>
          </group>
        ))}
        {city.walkers.map((_, i) => (
          <group key={`walker${i}`} ref={(el) => { refs.walkers.current[i] = el; }}>
            <Person shirt={pal.walker} onLimbs={limbCallbacks[i]} />
          </group>
        ))}

        <instancedMesh ref={refs.rain} args={[undefined, undefined, 160]} frustumCulled={false}>
          <boxGeometry args={[0.03, 0.8, 0.03]} />
          <meshBasicMaterial color={pal.rain} transparent opacity={0.35} depthWrite={false} />
        </instancedMesh>

        {labelIds.map((id) => (byId.get(id) ? <BuildingLabel key={id} b={byId.get(id)} /> : null))}

        <Director
          city={city}
          look={look}
          pal={pal}
          detail={detail}
          input={input}
          sim={sim}
          dom={dom}
          refs={refs}
          probe={probe}
          sunTarget={sunTarget}
          audio={audio}
          onSlow={() => setState((s) => nextAfterSlow(s))}
          onNearest={onNearest}
          onInteract={onInteract}
          onLabels={setLabelIds}
          onGate={setGateId}
        />
      </Physics>

      {detail.bloom && (look.ao || look.bloom > 0) && (
        <EffectComposer multisampling={0} frameBufferType={THREE.UnsignedByteType} enableNormalPass={look.ao}>
          {look.ao && <SSAO samples={8} radius={0.1} intensity={10} />}
          {look.bloom > 0 && <Bloom intensity={look.bloom} luminanceThreshold={0.5} luminanceSmoothing={0.25} />}
        </EffectComposer>
      )}
    </Canvas>
  );
}
