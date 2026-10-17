// The look. It names design tokens only, never a colour value, so the site's palette guard and the token
// check in lint-world.mjs both hold. The buildings are free low-poly models (Kenney City Kit, CC0) scaled to
// each footprint. A job's light is a roof beacon plus its windows, and the windows follow the same lit flag.
// ponytail: one shared model cannot light its windows from the replay on its own, so the windows are read from a mask
// in the model's material. Upgrade path: a per-building window texture driven by the lit flags, rather than the
// mask beside it.
export const LOOKS = [
  {
    id: 'neon',
    label: 'Neon night',
    sky: '--color-ink',
    ground: '--color-ink',
    tint: '--color-ink-muted',
    windowGlow: '--color-cyan-2',
    glow: 0.25,
    pulse: '--color-accent-2',
    pulseGlow: 3.0,
    winGlow: [0.9, 2.2],
    lamps: true,
    plot: '--color-ink-muted',
    edge: '--color-cyan',
    car: '--color-violet',
    walker: '--color-cyan',
    rain: '--color-cyan',
    grid: '--color-cyan-deep',
    ambient: [0.2, 0.7],
    sun: [0.9, 1.2],
    sunColour: '--color-cyan-2',
    env: 0.3,
    groundRough: 0.35,
    lane: '--color-cyan',
    ao: true,
    fog: [70, 230],
    bloom: 1.0,
  },
];
