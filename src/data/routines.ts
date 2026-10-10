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
  // The "Morning briefing" group stood here until 2026-09-25. Its nightly briefing job was
  // retired with Command Center's briefing module on 2026-08-21, and the page went on
  // describing it for five weeks.
  {
    label: 'Reminders',
    icon: 'radar',
    accent: 'var(--color-cyan)',
    note: 'Anything I would be annoyed to forget is booked in two places that share nothing, so either still arrives if the other fails.',
    items: [
      {
        name: 'Reminder due',
        trigger: 'A time I set, once or on repeat',
        channel: 'Push + desktop window',
        purpose: 'A cloud routine pushes one line to the phone, and a scheduled window on the PC opens with a button for each way I might answer. The phone half still arrives with the PC switched off.',
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
        trigger: 'A scheduled job on the agents server enters a failed state',
        channel: 'Push',
        purpose: 'A cron or ops job errored — the one alert I actually want to interrupt me, carrying enough context to triage straight from the phone.',
      },
      {
        name: 'Daily ops digest',
        trigger: 'Once a day on the agents server',
        channel: 'Chat',
        purpose: 'A summary of what the agents did and what is waiting on me. It arrives whether or not anything went wrong, so a missing digest is itself the signal that something stalled.',
      },
      {
        name: 'Alerting heartbeat',
        trigger: 'A weekly timer, whether or not anything went wrong',
        channel: 'Push',
        purpose: 'The routine that watches the other routines. Every alert here is a message that arrives when something breaks — so a broken alert CHANNEL is silent, and silence is exactly what a healthy week looks like. A deliberate weekly ping I expect to see makes a dead channel noticeable by its ABSENCE instead of by the outage it failed to report.',
      },
    ],
  },
  {
    label: 'Agents & decisions',
    icon: 'git-branch',
    accent: 'var(--color-violet)',
    note: 'My two agents work on their own schedule; when they need a human, they reach me. One page tells me each morning what is waiting across all of it.',
    // "Ready for review" and "Assignment update" stood here until 2026-09-26. Both came from the
    // desktop console's assignment queue and its phone app, which retired on 2026-09-25.
    items: [
      {
        name: 'Morning summary',
        trigger: 'Every morning',
        channel: 'Web push',
        purpose: 'One notification from my Command Center page: how many faults and the worst of them, how much is waiting on me, the week’s Claude spend against the weekly limit, and how many repos moved — my agents counted in. Encrypted to a key only my phone holds.',
      },
      {
        // Added 2026-10-02: the page has alerted beyond the morning summary since 2026-09-27
        // (Command_Center_OS CLAUDE.md), and this list did not say so.
        name: 'Won’t wait for the morning',
        trigger: 'A new red fault, a new question from an agent, or a snoozed item due back',
        channel: 'Web push',
        purpose: 'Between morning summaries the same page buzzes the phone only for what should not sit until tomorrow, and overnight it stays quiet except for red.',
      },
      {
        name: 'Needs a call',
        trigger: 'An agent hits a decision only I should make',
        channel: 'Chat',
        purpose: 'A gate in the workflow: the agent pauses and pings with the context, and I approve, redirect, or answer from wherever I am.',
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
        // Added 2026-10-02: running since 2026-09-25 (D72), push on since that day.
        name: 'Site check',
        trigger: 'Early every morning, on the PC',
        channel: 'Push + desktop window',
        purpose: 'A window compares this site’s systems pages with what actually runs and offers one Publish button, and a cloud routine pushes its one-line result to the phone. It also names any scheduled job whose last run failed, or a daily one that has stopped starting.',
      },
      {
        name: 'Dispatch from anywhere',
        trigger: 'I file an issue on my phone',
        channel: 'GitHub Mobile',
        purpose: 'The two-way half: I capture a task or bug from GitHub Mobile and the agents pick it up — the loop runs even when I’m away from the desk.',
      },
      // "App update ready" stood here until 2026-09-26: the Command Center phone app's
      // over-the-air update, retired with the desktop console on 2026-09-25.
    ],
  },
];
