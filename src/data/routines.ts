/**
 * Routines — a hand-authored, public-safe view of the notification routines that
 * keep me in the loop: what each one watches, how it reaches me, and why. Kept
 * GENERIC (no box names, bot handles, IPs, tokens, or employer detail) — the same
 * public-safe level as the Apps "Mobile & alerts" group. Not generated; edit here.
 */
export interface Routine {
  name: string;
  /** What fires it. */
  trigger: string;
  /** How it reaches me. */
  channel: string;
  /** What it watches, and why it earns a notification. */
  purpose: string;
}
export interface RoutineGroup {
  label: string;
  icon: string;
  accent: string;
  /** One-line note framing the whole group. */
  note?: string;
  items: Routine[];
}

export const routineGroups: RoutineGroup[] = [
  {
    label: 'Morning briefing',
    icon: 'radar',
    accent: 'var(--color-cyan)',
    note: 'A nightly agent sweeps every source and writes the day’s briefing before I’m awake — the push is just the “it’s ready” tap.',
    items: [
      {
        name: 'Briefing ready',
        trigger: 'Nightly briefing job finishes',
        channel: 'Push',
        purpose: 'The morning summary is written and waiting — projects, tasks, and what moved overnight — so the day starts already oriented instead of needing to be assembled.',
      },
    ],
  },
  {
    label: 'Health & heartbeats',
    icon: 'timer',
    accent: 'var(--color-indigo)',
    note: 'The scheduled machinery tells me it ran — and shouts if it didn’t.',
    items: [
      {
        name: 'Job failed',
        trigger: 'A scheduled job exits non-zero',
        channel: 'Push',
        purpose: 'A cron or ops job errored — the one alert I actually want to interrupt me, carrying enough context to triage straight from the phone.',
      },
      {
        name: 'Nightly ops finished',
        trigger: 'The nightly maintenance run completes',
        channel: 'Push',
        purpose: 'A quiet success heartbeat — silence would mean something stalled, so the “done” ping is the signal that all is well.',
      },
    ],
  },
  {
    label: 'Agents & decisions',
    icon: 'git-branch',
    accent: 'var(--color-green)',
    note: 'Agents dispatch, claim, and finish work — but only I move it to done. When they need a human, they reach me.',
    items: [
      {
        name: 'Needs a call',
        trigger: 'An agent hits a decision only I should make',
        channel: 'Chat',
        purpose: 'A gate in the workflow: the agent pauses and pings with the context, and I approve, redirect, or answer from wherever I am.',
      },
      {
        name: 'Ready for review',
        trigger: 'Work reaches the review column',
        channel: 'Chat',
        purpose: 'Something is finished and waiting on my human sign-off before it can move to done — the gate is enforced in code, not convention.',
      },
      {
        name: 'Assignment update',
        trigger: 'A dispatched assignment finishes or blocks',
        channel: 'Android push',
        purpose: 'The console dispatches work headlessly; when an assignment completes or gets stuck, the phone app’s foreground service pushes it straight to my lock screen — I can act without being at the desk.',
      },
    ],
  },
  {
    label: 'Deploys & repo',
    icon: 'network',
    accent: 'var(--color-accent)',
    note: 'The build pipeline and the repo keep me posted; I can dispatch work back from the same phone.',
    items: [
      {
        name: 'Deploy result',
        trigger: 'A site build finishes (green or failed)',
        channel: 'Push',
        purpose: 'Every push auto-deploys — the notification confirms it went live, or flags a failed build before anyone hits a broken page.',
      },
      {
        name: 'Dispatch from anywhere',
        trigger: 'I file an issue on my phone',
        channel: 'GitHub Mobile',
        purpose: 'The two-way half: I capture a task or bug from GitHub Mobile and the agents pick it up — the loop runs even when I’m away from the desk.',
      },
      {
        name: 'App update ready',
        trigger: 'The phone app detects a newer build',
        channel: 'Android (in-app)',
        purpose: 'The Command Center app checks its version endpoint and self-updates over the air — no app store, no sideload — so the console on my phone is always the current build.',
      },
    ],
  },
];
