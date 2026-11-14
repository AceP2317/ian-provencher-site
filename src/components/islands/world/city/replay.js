import { DAY_SECONDS } from './layout.js';

const RAIN_CYCLE = 21600;
const TAU = Math.PI * 2;
const STRIDE_RATE = 2.2;
const mod = (a, b) => ((a % b) + b) % b;

// A car's distance along its street at time t. It drives at its speed and stands for its pause at each
// stop, so one lap takes the street's length at that speed plus one pause per stop.
export function carDistance(t, car) {
  const lap = car.span / car.speed + car.stops.length * car.pause;
  let tau = mod(t + car.phaseTime, lap);
  let at = 0;
  for (const s of car.stops) {
    const run = (s - at) / car.speed;
    if (tau <= run) return at + tau * car.speed;
    tau -= run;
    if (tau <= car.pause) return s;
    tau -= car.pause;
    at = s;
  }
  return at + tau * car.speed;
}

// What the city shows at simulated time t: which job buildings flash, where traffic and crowds are,
// the daylight, and the rain. Pure in t, so the same t always gives the same picture.
export function replayAt(t, city) {
  const daylight = 0.5 - 0.5 * Math.cos((TAU * mod(t, DAY_SECONDS)) / DAY_SECONDS);
  const rain = Math.pow(Math.max(0, Math.sin((TAU * t) / RAIN_CYCLE)), 4);
  const lit = city.buildings.map((b) => (b.period > 0 && mod(t + b.phase, b.period) < b.burst ? 1 : 0));
  const cars = city.traffic.map((c) => ({ x: c.minX + carDistance(t, c), z: c.z }));
  const walkers = city.walkers.map((w) => ({
    x: w.x,
    z: w.minZ + mod(w.phase + w.speed * t, w.span),
    stride: w.speed * t * STRIDE_RATE,
  }));
  const dropY = city.rain.map((d) => city.rainHeight - mod(d.y0 + d.speed * t, city.rainHeight));
  return { t, daylight, rain, lit, cars, walkers, dropY };
}

// A number that changes whenever the picture changes, so a reader can tell two moments apart.
export function signature(r) {
  let h = 2166136261;
  const mix = (v) => {
    h ^= v;
    h = Math.imul(h, 16777619);
  };
  for (const v of r.lit) mix(v);
  mix(Math.round(r.daylight * 1000));
  mix(Math.round(r.rain * 1000));
  for (const c of r.cars) mix(Math.round(c.x * 100));
  for (const w of r.walkers) {
    mix(Math.round(w.z * 100));
    mix(Math.round(w.stride * 100));
  }
  return h >>> 0;
}
