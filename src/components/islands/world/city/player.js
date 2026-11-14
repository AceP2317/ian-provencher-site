export const WALK_SPEED = 3.6;
export const DRIVE_TOP = 9;
export const REVERSE_TOP = 4;
export const BOARD_RANGE = 3.5;
export const INTERACT_RANGE = 5;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Keys and the left thumb stick give forward and side; the view yaw turns them into world motion.
// Forward is -z at yaw 0 and -x at yaw pi/2, the same convention the camera and the car use.
export function walkVelocity(input, yaw) {
  let f = (input.keys.w ? 1 : 0) - (input.keys.s ? 1 : 0) + input.stick.y;
  let s = (input.keys.d ? 1 : 0) - (input.keys.a ? 1 : 0) + input.stick.x;
  f = clamp(f, -1, 1);
  s = clamp(s, -1, 1);
  const len = Math.hypot(f, s);
  if (len > 1) {
    f /= len;
    s /= len;
  }
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return { x: (-sin * f + cos * s) * WALK_SPEED, z: (-cos * f - sin * s) * WALK_SPEED };
}

// Throttle eases toward a target speed. Steering turns the heading, and only while the car moves.
export function driveStep(state, input, dt) {
  const throttle = clamp((input.keys.w ? 1 : 0) - (input.keys.s ? 1 : 0) + input.stick.y, -1, 1);
  const steer = clamp((input.keys.a ? 1 : 0) - (input.keys.d ? 1 : 0) - input.stick.x, -1, 1);
  let speed = state.speed;
  if (throttle !== 0) {
    const target = throttle > 0 ? DRIVE_TOP * throttle : REVERSE_TOP * throttle;
    speed += clamp(target - speed, -6 * dt, 6 * dt);
  } else {
    speed *= Math.pow(0.2, dt);
  }
  const authority = clamp(Math.abs(speed) / 4, 0, 1);
  const heading = state.heading + steer * 1.6 * dt * authority * Math.sign(speed || 1);
  return { speed, heading };
}

// Distance from a point to a building's footprint, zero when the point is on it.
export function footprintDistance(px, pz, b) {
  const dx = Math.max(Math.abs(px - b.x) - b.w / 2, 0);
  const dz = Math.max(Math.abs(pz - b.z) - b.d / 2, 0);
  return Math.hypot(dx, dz);
}

export function nearestBuilding(px, pz, buildings, range) {
  let best = null;
  for (const b of buildings) {
    const dist = footprintDistance(px, pz, b);
    if (dist <= range && (!best || dist < best.dist)) best = { building: b, dist };
  }
  return best;
}

// A district gate names its district only when the visitor is this close. Gates stand 96 m apart, so at
// most one of them can be in range at a time, and their labels never pile up at the horizon.
export const GATE_RANGE = 45;

export function gateInRange(at, gates, range = GATE_RANGE) {
  let best = null;
  for (const g of gates) {
    const d = Math.hypot(g.x - at.x, g.z - at.z);
    if (d <= range && (!best || d < best.d)) best = { id: g.id, d };
  }
  return best ? best.id : null;
}

// The ids of the buildings to name: the nearest first, then the next nearest that stands at least minGap
// metres from every name already chosen and from every reserved spot (the district gates, whose own labels
// always show), so no two names sit on one spot of the screen, up to cap names.
export function pickLabels(buildings, at, { range, cap, minGap, reserved = [] }) {
  const near = buildings
    .map((b) => ({ b, d: footprintDistance(at.x, at.z, b) }))
    .filter((o) => o.d <= range)
    .sort((a, b) => a.d - b.d);
  const picked = [];
  for (const { b } of near) {
    if (picked.length >= cap) break;
    const clear = (p) => Math.hypot(p.x - b.x, p.z - b.z) >= minGap;
    if (picked.every(clear) && reserved.every(clear)) picked.push(b);
  }
  return picked.map((b) => b.id);
}
