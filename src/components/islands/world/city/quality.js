// Detail levels: how many moving things and street objects the scene draws, and how much rain falls.
// The scene starts at the top level (a phone at the middle), and steps down when frames run slow.
const LEVELS = [
  { rainDrops: 0, walkers: 0, cars: 4, bloom: false, lamps: 24, trees: 0, benches: 0, bins: 0 },
  { rainDrops: 60, walkers: 8, cars: 10, bloom: false, lamps: 96, trees: 40, benches: 10, bins: 10 },
  { rainDrops: 160, walkers: 20, cars: 24, bloom: true, lamps: 160, trees: 120, benches: 30, bins: 30 },
];

export function detailFor(level) {
  return LEVELS[Math.min(Math.max(level, 0), LEVELS.length - 1)];
}

export function startingLevel(phone) {
  return phone ? 1 : 2;
}

export function stepDown(level) {
  return Math.max(0, level - 1);
}

// One slow window steps the detail down. A slow window at the lowest level is a strike, and two strikes
// mean this device cannot draw the city, so the page offers the list instead.
export function nextAfterSlow({ level, strikes }) {
  if (level > 0) return { level: level - 1, strikes, giveUp: false };
  const next = strikes + 1;
  return { level: 0, strikes: next, giveUp: next >= 2 };
}

// Reports once per window when the average frame is slower than the limit. The first frames after a
// look is built are skipped, because shader compiles would otherwise step the detail down for no reason.
export class FrameProbe {
  constructor(limitSeconds = 1 / 30, warmup = 60, window = 90) {
    this.limit = limitSeconds;
    this.warmup = warmup;
    this.window = window;
    this.skipped = 0;
    this.sum = 0;
    this.n = 0;
  }

  push(dt) {
    if (this.skipped < this.warmup) {
      this.skipped += 1;
      return false;
    }
    this.sum += dt;
    this.n += 1;
    if (this.n < this.window) return false;
    const slow = this.sum / this.n > this.limit;
    this.sum = 0;
    this.n = 0;
    return slow;
  }
}
