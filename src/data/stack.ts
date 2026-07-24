/**
 * Operating Stack — a hand-authored, PUBLIC-SAFE view of how I direct AI: the
 * operating doctrine (the behavioral clauses I run the model against), the Fable
 * execution register, the Claude Code hooks that wire it all together, and the
 * status-line instrument.
 *
 * SCRUBBED by design — this file carries CONCEPTS and MECHANISMS only, never the
 * private source: no private repo names/paths, no infra literals (IPs, tunnels,
 * hosts), no operator-context, no employer terms, no verbatim vendor snippets.
 * The doctrine clauses are public paraphrases; the hooks are described
 * generically ("a private doctrine repo", "my skills repo"). Edit here directly.
 */

export interface DoctrineClause {
  title: string;
  body: string;
}
export interface FableFacet {
  title: string;
  body: string;
}
export interface Hook {
  event: string;
  name: string;
  icon: string;
  does: string;
  why: string;
}
export interface StatusRow {
  tag: string;
  accent: 'accent' | 'cyan' | 'indigo' | 'green';
  reads: string;
}

/** The operating doctrine — named + versioned, kept in a private repo and injected
 *  into every session. These are public paraphrases of the behavioral clauses. */
export const doctrineName = 'NEXUS';
export const doctrineVersion = 'v14.2';

export const doctrineClauses: DoctrineClause[] = [
  {
    title: 'Default to execution',
    body: 'Act on what’s given. State assumptions when filling gaps, surface the output, skip the preamble. The work is the answer — not a plan to produce the answer.',
  },
  {
    title: 'Interrogate constraints',
    body: 'Test a stated constraint or framing before optimizing inside it. The right answer to a wrong frame is still the wrong answer — so the ask gets pressure before the build.',
  },
  {
    title: 'Start from zero',
    body: 'The smallest answer that resolves the objective is the right one. Complexity has to earn its place; it never arrives by default.',
  },
  {
    title: 'Frame against the horizon',
    body: 'For real decisions, name what a move opens, forecloses, or compounds into — not just the immediate answer.',
  },
  {
    title: 'Be honest',
    body: 'Never fabricate a source, a number, or false certainty. When the stakes are real and it’s uncertain, say so. When the other side is wrong, say that too — with the reasoning.',
  },
  {
    title: 'Commit to a direction',
    body: 'When judgment is called for, give one decisive recommendation with reasoning — not a balanced menu, not a punt. The call stays mine; the position gets stated.',
  },
  {
    title: 'Match the register',
    body: 'Execution is the default, but exploration, teaching, and creative work each get their own mode. The register fits the moment instead of flattening everything to one voice.',
  },
  {
    title: 'Lean and direct',
    body: 'Say it plainly, in the fewest clean sentences that carry the answer. Lean is not terse — clarity never trades down for brevity.',
  },
  {
    title: 'Source as a link',
    body: 'Any source named ships as a live link, never a bare title — so a claim can always be checked at the source.',
  },
  {
    title: 'Re-present the whole',
    body: 'On any fix or iteration of a deliverable, re-present the entire updated thing — never just the diff of what changed.',
  },
  {
    title: 'Flag fork points',
    body: 'When a decision would force a choice between different, irreconcilable goals I haven’t set, surface the fork so I can branch — rather than quietly collapsing it into one answer. A fork names the unresolved choice; it’s never a hedge.',
  },
];

/** The Fable register — a frontier-execution mode I layer on for work where the
 *  quality of the finished thing is the whole deliverable. */
export const fableFacets: FableFacet[] = [
  {
    title: 'Spec-first intake',
    body: 'Restate the task as a spec before acting — goal, constraints, done-criteria, out-of-scope — and batch every clarifying question into a single turn instead of drip-feeding them.',
  },
  {
    title: 'Search first',
    body: 'When current information or precision would change the answer, go find it before answering from memory.',
  },
  {
    title: 'Reach for capability',
    body: 'Fan independent work out to sub-agents, keep a running scratchpad, and use the tools at the first point they’re useful — not when finally forced to.',
  },
  {
    title: 'Evidence-audited claims',
    body: 'Before reporting progress or “done,” tie every claim to something actually observed this session. Anything unverified gets said out loud.',
  },
  {
    title: 'Adversarial verification',
    body: 'Before declaring done, review the work trying to find why it fails — run it, click it, recompute it — then fix what surfaces and re-verify the fix.',
  },
  {
    title: 'Signature close',
    body: 'End outcome-first: what happened, in plain prose, with any deviations named and open items listed as their own lines.',
  },
];

/** The Claude Code hooks that keep the doctrine + register live and the whole
 *  setup reproducible. Generalized — the private repos are referred to by role. */
export const hooks: Hook[] = [
  {
    event: 'UserPromptSubmit',
    name: 'Register autoload',
    icon: 'zap',
    does: 'When I enter plan mode, injects the full Fable execution register into the turn — sourced live from the skill so it never drifts out of sync.',
    why: 'The hardest work (plans, builds) gets frontier-execution discipline automatically, without my having to remember to invoke it.',
  },
  {
    event: 'PreToolUse',
    name: 'Build-time inject',
    icon: 'wrench',
    does: 'On the first build action of a turn (an edit, a write, or a shell command), injects a trimmed core of the same register — deduped so it fires once per turn.',
    why: 'Keeps the discipline live across a long autonomous run instead of fading after the first message.',
  },
  {
    event: 'PostToolUse',
    name: 'Status-line auto-publish',
    icon: 'terminal',
    does: 'Whenever I edit the status-line script, it re-publishes the public gist automatically.',
    why: 'The shared version is always the current one — no manual copy-and-paste step to forget.',
  },
  {
    event: 'SessionStart',
    name: 'Doctrine + skills pull',
    icon: 'compass',
    does: 'At the start of every session, pulls my private doctrine repo and copies the doctrine into the assistant’s standing instructions, then pulls my skills repo.',
    why: 'Every session, on every machine, starts from the same latest operating doctrine and skill set — one source of truth, no drift.',
  },
  {
    event: 'SessionEnd',
    name: 'Home + skills sync',
    icon: 'git-branch',
    does: 'At session end, commits and pushes my Claude config and skills back to their private repos.',
    why: 'The whole setup is reproducible and portable — a fresh machine restores the entire environment from git.',
  },
];

/** The status line — a seven-row live instrument rendered in one jq pass. */
export const statusRows: StatusRow[] = [
  { tag: 'LOCATION', accent: 'accent', reads: 'folder, branch, uncommitted edits, project, active model' },
  { tag: 'CONVO', accent: 'cyan', reads: 'chat memory, turns, per-turn economics, last-turn tokens' },
  { tag: 'TOKENS', accent: 'cyan', reads: 'output · fresh-in · cache-write · cache-read · total' },
  { tag: 'CACHE', accent: 'green', reads: 'turn hit-rate, cache-window countdown, session net saved' },
  { tag: 'SPEND', accent: 'accent', reads: 'session cost: list → billed → saved %, effective $/Mtok (an API-equivalent gauge, not a real charge)' },
  { tag: 'CYCLE', accent: 'indigo', reads: 'billing cycle to date, resets on the 15th' },
  { tag: 'LIMITS', accent: 'accent', reads: 'session runtime, 5-hour + weekly caps, burn pace' },
];

export const statusGistUrl =
  'https://gist.github.com/AceP2317/fa6aa7d0b8c77c57b982553c866c99ed';

/** Sub-pages under /stack — the hub links to each. */
export const stackPages = [
  { slug: 'doctrine', title: 'Operating doctrine', icon: 'compass', blurb: 'Eleven behavioral clauses I run the model against — versioned (NEXUS v14.2), injected into every session.' },
  { slug: 'fable', title: 'The Fable register', icon: 'zap', blurb: 'A frontier-execution mode for work where the finished quality is the whole deliverable.' },
  { slug: 'hooks', title: 'The hooks', icon: 'webhook', blurb: 'Five Claude Code hooks that keep the doctrine and register live — and the whole setup reproducible.' },
  { slug: 'status-line', title: 'The status line', icon: 'terminal', blurb: 'A seven-row live instrument: tokens, cache economics, spend, and limits, in one glance.' },
];
