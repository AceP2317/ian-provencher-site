/**
 * jobs.ts — typed loader over the committed job-board snapshot
 * (src/data/jobs.generated.json), produced by scripts/fetch-jobs.mjs
 * (job-aggregator API + optional AI scoring → denylist scan → committed JSON).
 * Never hand-edited. The page renders a link-out board sorted by fit score.
 */
import data from './jobs.generated.json';

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  /** How the row reached the board: 'remote', 'hybrid', 'local', 'onsite' (D109), 'both', or 'unverified' (D81). */
  origin?: string;
  /** Where the card says the job is, led by the origin: "Remote · listed: Buffalo" (D81). */
  place?: string;
  /** The supply-chain family the title belongs to, and its card label (D81). */
  family?: string;
  familyLabel?: string;
  /** The reposting site the posting came through, when the employer is named from its text. */
  via?: string;
  /** True when `url` is the employer's own posting, the only page that can prove it is gone. */
  direct?: boolean;
  /** The day a source last returned this posting (YYYY-MM-DD). */
  seenAt?: string;
  /** True when no source returned it today and THE HOLD kept it, for up to seven days. */
  held?: boolean;
  url: string;
  /** Human comp string, e.g. "$95k–$120k" — or null if the posting hid it. */
  salary: string | null;
  /** Annualized floor for sort/filter — or null. */
  salaryMin: number | null;
  /** ISO date the posting appeared. */
  postedAt: string | null;
  /** Fit score 0–100 (AI, or a keyword/salary heuristic fallback). */
  score: number;
  /** One-line "why this fits" note. */
  why: string;
  /** Short tags, e.g. ["remote", "in-band"]. */
  flags: string[];
  /** Feed the posting came from, e.g. "Adzuna". */
  source: string;
  /**
   * How much of the job is AI work, as the scorer judged its duties (D137, 2026-11-15). The board
   * publishes only 'main': AI work is the daily work. A row written before D137 carries none.
   */
  aiShare?: 'main' | 'duty' | 'mention' | 'none';
}

const byScore = (a: Job, b: Job) => b.score - a.score;

/* ONE LIST (D137). Stated POSITIVELY, never as "everything that is not a near miss": a snapshot
   from before D137 holds planning rows with no aiShare, and a fail-open filter would publish them
   under a heading that promises AI work. */
export const jobs = (data as Job[]).filter((j) => j.aiShare === 'main').sort(byScore);

/** Newest-fetch timestamp isn't tracked per-record; the board notes cadence in copy. */
export const hostOf = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** Green / amber / gray band by score, as a token reference for the score chip. */
export const scoreTone = (score: number): string =>
  score >= 85 ? 'var(--color-cyan-2)' : score >= 70 ? 'var(--color-accent)' : 'var(--color-label)';
