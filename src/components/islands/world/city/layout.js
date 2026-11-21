import { hash, rng } from '../shared/noise.js';

export const DAY_SECONDS = 86400;
export const PITCH = 12;
const COLS = 6;
const MARGIN = 9;
const GAP = 18;
const FENCE_HEIGHT = 1.4;
const FENCE_THICK = 0.15;
const RAIN_DROPS = 160;
const RAIN_SPREAD = 40;
const RAIN_HEIGHT = 30;
const WALKERS_PER_STREET = 2;
const CARS_PER_STREET = 2;
const CAR_PAUSE = 1.6;
const CAR_SPEED = [6, 10];
const WALKER_SPEED = [1.3, 1.7];
const VERGE_Z = -6;
const MID_HEIGHT = 15;
const METRIC_HEIGHT = [8, 22];

// Seconds between runs for each cadence the cron page publishes, and a tower height to match.
// ponytail: a cadence label not listed here is drawn as a weekly, mid-height tower, silently.
// Upgrade path: a cadence the cron page publishes but these tables do not list should fail the build, so a new label cannot pass unnoticed.
const PERIOD = { 'Every few minutes': 300, Hourly: 3600, Nightly: 86400, Daily: 86400, Weekly: 604800, Monthly: 2592000 };
const HEIGHT = { 'Every few minutes': 24, Hourly: 16, Nightly: 11, Daily: 11, Weekly: 7, Monthly: 4 };
const UNKNOWN = { period: 604800, height: 9 };

// How each family's buildings are sized and lit. Only the scheduled jobs flash, on their cadence.
const RULE = {
  cron: 'jobs',
  architectures: 'metric',
  stack: 'metric',
  repos: 'push',
  builds: 'decor',
};

const rangeOf = (values) => {
  const v = values.filter(Number.isFinite);
  return v.length ? { lo: Math.min(...v), hi: Math.max(...v) } : null;
};

function metricHeight(metric, range) {
  if (!range || !Number.isFinite(metric) || range.hi === range.lo) return MID_HEIGHT;
  const [a, b] = METRIC_HEIGHT;
  return a + ((b - a) * (metric - range.lo)) / (range.hi - range.lo);
}

function buildingFor(family, moon, at, range) {
  const r = at.r;
  const b = {
    id: moon.id,
    label: moon.label,
    detail: moon.detail,
    cadence: moon.cadence ?? '',
    district: at.district,
    x: at.x,
    z: at.z,
    w: 5 + r() * 1.4,
    d: 5 + r() * 1.4,
    period: 0,
    phase: 0,
    burst: 0,
    h: 0,
    glow: 0,
  };
  if (family === 'jobs') {
    const known = Object.hasOwn(PERIOD, moon.cadence);
    b.period = known ? PERIOD[moon.cadence] : UNKNOWN.period;
    const baseH = known ? HEIGHT[moon.cadence] : UNKNOWN.height;
    b.h = baseH * (0.85 + r() * 0.3);
    b.phase = r() * b.period;
    b.burst = Math.min(b.period * 0.08, 30);
    b.glow = 0.6 + r() * 0.8;
  } else if (family === 'metric') {
    b.h = metricHeight(moon.metric, range);
    b.glow = 0.8;
  } else if (family === 'push') {
    b.h = 9 + r() * 8;
    b.glow = Number.isFinite(moon.daysSincePush) ? 0.5 + 1.2 * Math.exp(-moon.daysSincePush / 30) : 0.5;
  } else {
    b.h = 8 + r() * 10;
    b.glow = 0.6 + r() * 0.8;
  }
  return b;
}

function interleave(lists) {
  const out = [];
  const n = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < n; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

// districts: [{ id, label, moons: [{ id, label, detail, cadence?, metric?, daysSincePush? }] }], jobs first.
// Each district is a grid of up to six columns, and the districts sit in one row with a street between
// them. Every district's first street runs on z = PITCH / 2, so those streets join into one avenue.
export function buildCity(districts, seed = 'the-estate') {
  const buildings = [];
  const placed = [];
  const carsBy = [];
  const walkersBy = [];
  const fixed = [];
  let x0 = 0;
  let maxZ = 0;

  districts.forEach((d, di) => {
    const family = RULE[d.id];
    if (!family) throw new Error(`buildCity: no sizing rule for the district "${d.id}"`);
    const n = d.moons.length;
    const cols = Math.max(1, Math.min(COLS, n));
    const rows = Math.max(1, Math.ceil(n / COLS));
    const bounds = {
      minX: x0 - MARGIN,
      maxX: x0 + (cols - 1) * PITCH + MARGIN,
      minZ: -MARGIN,
      maxZ: (rows - 1) * PITCH + MARGIN,
    };
    maxZ = Math.max(maxZ, bounds.maxZ);
    const range = family === 'metric' ? rangeOf(d.moons.map((m) => m.metric)) : null;
    d.moons.forEach((moon, i) => {
      const r = rng(hash(`${seed}:${d.id}:${moon.id}`));
      const b = buildingFor(family, moon, { r, district: d.id, x: x0 + (i % COLS) * PITCH, z: Math.floor(i / COLS) * PITCH }, range);
      buildings.push(b);
      fixed.push({ kind: 'building', x: b.x, y: b.h / 2, z: b.z, hx: b.w / 2, hy: b.h / 2, hz: b.d / 2 });
    });

    placed.push({
      id: d.id,
      label: d.label,
      count: n,
      cols,
      rows,
      x0,
      bounds,
      gate: { x: x0, z: -6.5 },
      travel: { x: x0, z: PITCH / 2 },
    });

    const streetRand = rng(hash(`${seed}:${d.id}:streets`));
    const span = bounds.maxX - bounds.minX;
    const stops = Array.from({ length: cols }, (_, k) => PITCH * (k + 1));
    const cars = [];
    for (let k = 0; k < rows; k++) {
      const z = k * PITCH + PITCH / 2;
      for (let c = 0; c < CARS_PER_STREET; c++) {
        const speed = CAR_SPEED[0] + streetRand() * (CAR_SPEED[1] - CAR_SPEED[0]);
        const lap = span / speed + stops.length * CAR_PAUSE;
        cars.push({ district: di, z, minX: bounds.minX, span, speed, stops, pause: CAR_PAUSE, phaseTime: streetRand() * lap });
      }
    }
    carsBy.push(cars);

    const walkers = [];
    for (let c = -1; c < cols; c++) {
      const x = x0 + c * PITCH + PITCH / 2;
      for (let w = 0; w < WALKERS_PER_STREET; w++) {
        walkers.push({
          district: di,
          x,
          minZ: bounds.minZ,
          span: bounds.maxZ - bounds.minZ,
          phase: streetRand() * (bounds.maxZ - bounds.minZ),
          speed: WALKER_SPEED[0] + streetRand() * (WALKER_SPEED[1] - WALKER_SPEED[0]),
        });
      }
    }
    walkersBy.push(walkers);

    x0 = bounds.maxX + GAP + MARGIN;
  });

  const minX = placed[0].bounds.minX;
  const maxX = placed[placed.length - 1].bounds.maxX;
  const spanX = maxX - minX;
  const spanZ = maxZ - -MARGIN;
  const fy = FENCE_HEIGHT / 2;
  const cx = (minX + maxX) / 2;
  const cz = (-MARGIN + maxZ) / 2;
  fixed.push(
    { kind: 'fence', x: minX, y: fy, z: cz, hx: FENCE_THICK, hy: fy, hz: spanZ / 2 },
    { kind: 'fence', x: maxX, y: fy, z: cz, hx: FENCE_THICK, hy: fy, hz: spanZ / 2 },
    { kind: 'fence', x: cx, y: fy, z: -MARGIN, hx: spanX / 2, hy: fy, hz: FENCE_THICK },
    { kind: 'fence', x: cx, y: fy, z: maxZ, hx: spanX / 2, hy: fy, hz: FENCE_THICK },
  );

  const rainRand = rng(hash(`${seed}:rain`));
  const rain = Array.from({ length: RAIN_DROPS }, () => ({
    dx: (rainRand() * 2 - 1) * RAIN_SPREAD,
    dz: (rainRand() * 2 - 1) * RAIN_SPREAD,
    y0: rainRand() * RAIN_HEIGHT,
    speed: 12 + rainRand() * 6,
  }));

  const first = buildings[0];
  const door = first
    ? { x: first.x - first.w / 2 - 0.06, y: 1.2, z: first.z, hx: 0.06, hy: 1.2, hz: 0.7, base: 1.2, lift: 2.6 }
    : null;

  return {
    seed,
    bounds: { minX, maxX, minZ: -MARGIN, maxZ },
    districts: placed,
    buildings,
    fixed,
    spawn: { x: -7.5, z: 0, yaw: -Math.PI / 2 },
    vehicle: { x: -7.5, z: -4, heading: 0, hx: 0.8, hy: 0.6, hz: 1.6 },
    crates: [
      { x: 5, z: -6.5 },
      { x: 6.2, z: -6.5 },
      { x: 5.6, z: -7.6 },
    ],
    door,
    traffic: interleave(carsBy),
    walkers: interleave(walkersBy),
    rain,
    rainHeight: RAIN_HEIGHT,
  };
}

export function travelSpot(city, districtId) {
  const d = city.districts.find((x) => x.id === districtId);
  return d ? d.travel : null;
}

// One lamp per twelve metres on each kerb, along every street of every district.
export function lampSpots(city) {
  const spots = [];
  for (const d of city.districts) {
    const { minX, maxX, minZ, maxZ } = d.bounds;
    for (let k = 0; k < d.rows; k++) {
      const z = k * PITCH + PITCH / 2;
      for (let x = minX + 6; x < maxX - 3; x += PITCH) spots.push({ x, z: z - 2.6 }, { x, z: z + 2.6 });
    }
    for (let c = -1; c < d.cols; c++) {
      const x = d.x0 + c * PITCH + PITCH / 2;
      for (let z = minZ + 6; z < maxZ - 3; z += PITCH) spots.push({ x: x - 2.6, z }, { x: x + 2.6, z });
    }
  }
  return spots;
}

// Trees, benches and bins on each district's north verge, and a zebra of stripes at every crossing
// of a row street with a cross street. Seeded, so the same city always gets the same furniture.
export function furnitureSpots(city) {
  const trees = [];
  const benches = [];
  const bins = [];
  const zebra = [];
  for (const d of city.districts) {
    const r = rng(hash(`${city.seed}:${d.id}:furniture`));
    for (let i = 0; i < d.cols; i++) {
      const x = d.x0 + i * PITCH;
      const a = r();
      const b = r();
      const c = r();
      if (a < 0.8) trees.push({ x: x - 2.5, z: VERGE_Z });
      if (b < 0.3) benches.push({ x: x + 2.5, z: VERGE_Z - 0.6 });
      if (c < 0.25) bins.push({ x: x - 4.2, z: VERGE_Z + 0.4 });
    }
    for (let k = 0; k < d.rows; k++) {
      const s = k * PITCH + PITCH / 2;
      for (let c = -1; c < d.cols; c++) {
        const X = d.x0 + c * PITCH + PITCH / 2;
        for (const o of [-1.2, -0.6, 0, 0.6, 1.2]) zebra.push({ x: X + o, z: s });
      }
    }
  }
  return { trees, benches, bins, zebra };
}
