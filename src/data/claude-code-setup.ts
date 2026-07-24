/**
 * claude-code-setup.ts — the content for the 3D "Claude Code Setup" exhibit
 * (/claude-setup). A bespoke showcase scene renders these stations as a reactor-core
 * engine ringed by its operating layers, with the operator feeding in and the
 * outputs flowing out. The scene owns all geometry/positions; this file is pure,
 * public-safe content — what each layer is and why it's there.
 *
 * PUBLIC-SAFE: the Stack section already documents the doctrine / hooks / fable /
 * status-line publicly; keep this to the same generic register — no infra
 * literals, no employer facts. The build-time gate is the backstop.
 */

/** Where a station sits in the scene. */
export type SetupZone = 'operator' | 'core' | 'layer' | 'output';
/** Token family a station is colored by (resolved to hex in the WebGL scene). */
export type SetupAccent = 'amber' | 'cyan' | 'indigo' | 'green' | 'violet';

export interface SetupStation {
  id: string;
  label: string;
  /** Short type label, e.g. "Doctrine", "Hooks". */
  kicker: string;
  /** One line under the label. */
  tagline: string;
  /** The "why" — rich text (**bold**, `code`) shown in the inspector. */
  why: string;
  zone: SetupZone;
  accent: SetupAccent;
}

export interface SetupTourStep {
  title: string;
  body: string;
  /** Station ids to highlight + frame. Empty = the whole rig. */
  focus: string[];
}

export interface ClaudeCodeSetup {
  title: string;
  tagline: string;
  /** Overview copy shown in the inspector before anything is selected. */
  story: string;
  stations: SetupStation[];
  tour: SetupTourStep[];
}

export const claudeCodeSetup: ClaudeCodeSetup = {
  title: 'My Claude Setup',
  tagline: 'The operating system I run a frontier model with — every layer, and why.',
  story:
    'The model is the engine. This is the operating system I run it with — the doctrine, hooks, skills, memory, subagents, tools, and instruments that turn one operator’s direction into shipped software. Click any module to see what it does and why it’s there, or take the guided tour.',

  stations: [
    {
      id: 'operator',
      label: 'Operator',
      kicker: 'The human',
      tagline: 'Ian, directing the work',
      why: 'Every session starts here. I set the objective, the constraints, and the taste — then get out of the way. Everything else in this exhibit exists to turn that direction into shipped software without me re-typing the same discipline on every task.',
      zone: 'operator',
      accent: 'amber',
    },
    {
      id: 'engine',
      label: 'Claude Code',
      kicker: 'Engine',
      tagline: 'The frontier model, in the repo',
      why: 'The model — currently **Opus 4.8** — reads the actual repository, runs tools, edits files, and executes. On its own it’s a brilliant generalist. Everything orbiting it here is what makes it run like a disciplined senior engineer who already knows my estate.',
      zone: 'core',
      accent: 'amber',
    },
    {
      id: 'doctrine',
      label: 'NEXUS Doctrine',
      kicker: 'Doctrine',
      tagline: 'Versioned operating rules',
      why: 'A single, versioned rulebook loaded every session: honesty as the floor, execution by default, commit to a direction, source as a link. It’s the constitution — `vMAJOR.MINOR`, bumped on any edit — so the model behaves the same way on task one and task one hundred.',
      zone: 'layer',
      accent: 'amber',
    },
    {
      id: 'hooks',
      label: 'SessionStart Hooks',
      kicker: 'Hooks',
      tagline: 'Automatic, every session',
      why: 'Shell hooks the harness runs on its own — they mirror the canonical doctrine into place, load the execution registers, and wire up the live status line. The discipline isn’t something I remember to switch on; the hooks make it the default state of every session.',
      zone: 'layer',
      accent: 'cyan',
    },
    {
      id: 'skills',
      label: 'Skills Library',
      kicker: 'Skills',
      tagline: 'Modes I invoke on demand',
      why: 'A library of explicit-invoke registers and operational procedures — scoping, blueprinting, session-wrap, exec briefs, the voice passes, deploy prompts. Each is a packaged way of working I can drop into a task, so complex rituals run consistently instead of being improvised.',
      zone: 'layer',
      accent: 'indigo',
    },
    {
      id: 'memory',
      label: 'Persistent Memory',
      kicker: 'Memory',
      tagline: 'Facts that survive a reset',
      why: 'File-based memory that persists across sessions — who I am, standing feedback, project state. The model recalls what was established last week instead of relearning it — while treating memory as a cache to verify, never as ground truth.',
      zone: 'layer',
      accent: 'green',
    },
    {
      id: 'subagents',
      label: 'Subagent Fan-out',
      kicker: 'Subagents',
      tagline: 'Parallel work, one director',
      why: 'Independent subtasks get delegated to parallel agents — explorers map the codebase, planners design, researchers verify sources — while the main thread keeps moving. It’s how one operator covers ground that would otherwise be strictly serial.',
      zone: 'layer',
      accent: 'violet',
    },
    {
      id: 'mcp',
      label: 'MCP Servers',
      kicker: 'Tools',
      tagline: 'Reach beyond the repo',
      why: 'The Model Context Protocol connects the engine to tools outside the codebase — a private notes vault, the browser, mail and calendar — through a typed, permissioned interface. The repo is the workshop; MCP is everything else on the bench.',
      zone: 'layer',
      accent: 'cyan',
    },
    {
      id: 'statusline',
      label: 'Status-line Instrument',
      kicker: 'Instrument',
      tagline: 'Live cost & context readout',
      why: 'A live status line renders what every session is doing — model, context used, spend — so the run is legible in real time instead of a black box. If something drifts, I see it as it happens rather than in the bill.',
      zone: 'layer',
      accent: 'amber',
    },
    {
      id: 'outputs',
      label: 'Outputs',
      kicker: 'What ships',
      tagline: 'Repos · tools · sites',
      why: 'The whole apparatus exists to produce owned, working software — the repos, operational tools, cron jobs, and sites in the rest of this workspace. This very site was built, and is maintained, through exactly this setup.',
      zone: 'output',
      accent: 'green',
    },
  ],

  tour: [
    {
      title: 'The whole rig',
      body: 'This is my entire Claude Code setup — the model at the center, the operating system around it. Rotate it, or step through to see how each piece earns its place.',
      focus: [],
    },
    {
      title: 'You, directing',
      body: 'It starts with direction: an objective and its constraints. The point of everything else is to make that direction land as shipped work without re-typing the discipline each time.',
      focus: ['operator', 'engine'],
    },
    {
      title: 'The doctrine',
      body: 'A versioned rulebook loads every session — honesty floor, execution by default, commit to a direction. The model behaves the same way on task one and task one hundred.',
      focus: ['doctrine', 'engine'],
    },
    {
      title: 'Hooks make it automatic',
      body: 'SessionStart hooks put the doctrine and registers in place on their own. Discipline is the default state of a session, not something I have to remember to switch on.',
      focus: ['hooks', 'doctrine', 'engine'],
    },
    {
      title: 'Skills as modes',
      body: 'Packaged ways of working I invoke on demand — scoping, planning, wrapping, briefing. Complex rituals run consistently instead of being improvised each time.',
      focus: ['skills', 'engine'],
    },
    {
      title: 'Memory across sessions',
      body: 'File-based memory carries what was established last week, so the model recalls context instead of relearning it — while treating it as a cache to verify.',
      focus: ['memory', 'engine'],
    },
    {
      title: 'Subagents in parallel',
      body: 'Independent subtasks fan out to parallel agents while the main thread keeps moving — how one operator covers ground that would otherwise be serial.',
      focus: ['subagents', 'engine'],
    },
    {
      title: 'Tools beyond the repo',
      body: 'MCP connects the engine to a notes vault, the browser, mail and calendar — a typed, permissioned reach past the codebase itself.',
      focus: ['mcp', 'engine'],
    },
    {
      title: 'The instrument',
      body: 'A live status line shows model, context, and spend as the session runs — the work stays legible instead of being a black box.',
      focus: ['statusline', 'engine'],
    },
    {
      title: 'What ships',
      body: 'All of it exists to produce owned, working software — the repos, tools, and sites here. This site was built through exactly this setup.',
      focus: ['outputs', 'engine'],
    },
  ],
};
