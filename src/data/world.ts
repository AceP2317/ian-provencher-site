// ============================================================================
// The estate as a world — the PUBLIC model.
//
// Every number and name here comes from data the safe export already published
// (architectures, tools, repos, cron, stack). Nothing is re-typed. The world is
// a second render of those same files, so it cannot describe a thing the rest
// of the site does not already show.
//
// Shape: one planet per mechanism family, one moon per record in it. A moon's
// orbit speed carries meaning where the data has it: a scheduled job orbits
// faster the more often it runs.
//
// ponytail: the private layer (exact names and timings) is NOT here. It is
// served from the /api/world/private route after Access sign-in, and the island
// swaps it in when that route answers. This file stays public-only on purpose.
// Upgrade path: none needed. The public model is the intended subset, and the
// private one is read at runtime, never built into the page.
// ============================================================================
import { liveArchitectures } from './architectures';
import { liveTools } from './tools';
import repos from './repos.generated.json';
import { runningJobs } from './cron';
import stack from './stack.generated.json';

export interface Moon {
  id: string;
  label: string;
  detail: string;
  /** Distance from the planet, in scene units. */
  radius: number;
  /** Radians per second, sign-free. */
  speed: number;
  /** Start angle, so moons do not line up. */
  phase: number;
  /** The published cadence label of a scheduled job, when this moon is one. */
  cadence?: string;
  /** A size the data itself holds for this record: an architecture's node count, a stack component's count. */
  metric?: number;
  /** Days since the repository was last pushed, as of this build. */
  daysSincePush?: number;
}

interface MoonInput {
  label: string;
  detail: string;
  speed: number;
  cadence?: string;
  metric?: number;
  daysSincePush?: number;
}

export interface Planet {
  id: string;
  label: string;
  blurb: string;
  /** A design token, resolved to a colour at mount (WebGL cannot read var()). */
  token: '--color-accent' | '--color-cyan' | '--color-indigo' | '--color-violet';
  moons: Moon[];
}

/** How often a job runs, as an orbit speed. Unknown cadences get a slow orbit. */
const CADENCE_SPEED: Record<string, number> = {
  'Every few minutes': 1.0,
  Hourly: 0.6,
  Nightly: 0.3,
  Daily: 0.3,
  Weekly: 0.15,
  Monthly: 0.08,
};

/** Spread n moons over rings, so 50 records read as a system, not a line. */
function place(i: number, n: number): { radius: number; phase: number } {
  const perRing = 12;
  const ring = Math.floor(i / perRing);
  const within = i % perRing;
  const ringCount = Math.min(perRing, n - ring * perRing);
  return {
    radius: 0.7 + ring * 0.32,
    phase: (within / ringCount) * Math.PI * 2,
  };
}

type Rec = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
// Read once per build, so the page and every build of it agree on the day.
const BUILT_AT = Date.now();
const DAY_MS = 86_400_000;
const daysSince = (iso: unknown): number | undefined => {
  const t = Date.parse(str(iso));
  return Number.isNaN(t) ? undefined : Math.max(0, Math.floor((BUILT_AT - t) / DAY_MS));
};

// Systems still running only. A retired one (legacy set) would orbit as live (D62).
const archList = liveArchitectures as unknown as Rec[];
// Live tools only, the same filter the Builds page uses (retired ones stay there, dimmed).
const toolList = liveTools as unknown as Rec[];
const repoList = repos as Rec[];
// Running jobs only, the same filter the cron page uses. A retired job would
// otherwise orbit as if it still ran (D62). Retired ones stay on /cron, dimmed.
const cronList = runningJobs as unknown as Rec[];

function planet(id: string, label: string, blurb: string, token: Planet['token'], items: MoonInput[]): Planet {
  return {
    id,
    label,
    blurb,
    token,
    moons: items.map((it, i) => ({ id: `${id}-${i}`, ...it, ...place(i, items.length) })),
  };
}

export const WORLD: Planet[] = [
  planet(
    'architectures',
    'Architectures',
    'The systems I run, drawn as diagrams.',
    '--color-cyan',
    archList.map((a) => ({
      label: str(a.title),
      detail: str(a.tagline),
      speed: 0.12,
      metric: Array.isArray(a.nodes) ? a.nodes.length : undefined,
    })),
  ),
  planet(
    'builds',
    'Builds',
    'The apps and tools I have built and shipped.',
    '--color-accent',
    toolList.map((t) => ({ label: str(t.name), detail: str(t.description), speed: 0.1 })),
  ),
  planet(
    'repos',
    'Repositories',
    'Public repositories, pulled from GitHub.',
    '--color-violet',
    repoList.map((r) => ({ label: str(r.name), detail: str(r.description), speed: 0.1, daysSincePush: daysSince(r.pushedAt) })),
  ),
  planet(
    'cron',
    'Scheduled jobs',
    'Every scheduled job, orbiting faster the more often it runs.',
    '--color-indigo',
    cronList.map((j) => {
      const cadence = str(j.cadence);
      return {
        label: str(j.label),
        detail: `${str(j.purpose)} (${cadence.toLowerCase()})`,
        speed: CADENCE_SPEED[cadence] ?? 0.1,
        cadence,
      };
    }),
  ),
  planet(
    'stack',
    'Operating stack',
    'The doctrine, hooks, skills and subagents that wire the work together.',
    '--color-cyan',
    [
      { label: 'Hooks', detail: `${stack.hookCount} hooks across ${stack.hookEvents.length} events.`, speed: 0.2, metric: stack.hookCount },
      { label: 'Skills', detail: `${stack.skillCount} skills the workflow can call.`, speed: 0.15, metric: stack.skillCount },
      { label: 'Subagents', detail: `${stack.agentCount} specialist subagents.`, speed: 0.12, metric: stack.agentCount },
      { label: 'Doctrine', detail: `Operating doctrine ${stack.doctrineVersion}.`, speed: 0.08 },
    ],
  ),
];
