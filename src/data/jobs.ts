/**
 * jobs.ts — typed loader over the committed job-board snapshot
 * (src/data/jobs.generated.json), produced by scripts/fetch-jobs.mjs
 * (job-aggregator API + optional AI scoring → denylist scan → committed JSON).
 * Never hand-edited. The page renders a link-out board sorted by fit score.
 */
import data from './jobs.generated.json';

/** The three kinds the board shows (D142), with their card labels. A copy of KINDS in
 *  scripts/lib/job-rubric.mjs, which the board's selftest compares against this file. */
export const KIND_LABELS = {
  'ai-supply-chain': 'AI and supply chain together',
  'ai-ops': 'AI in operations',
  'supply-chain': 'Supply chain',
} as const;
export type Kind = keyof typeof KIND_LABELS;
const isKind = (k: unknown): k is Kind => typeof k === 'string' && k in KIND_LABELS;

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  /** How the row reached the board: 'remote', the only origin since D142. */
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
  /** Annualized ceiling — or null. */
  salaryMax?: number | null;
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
  /** Which of the three kinds the row is (D142). A row written before D142 carries none. */
  kind?: Kind;
}

const byScore = (a: Job, b: Job) => b.score - a.score;

/* THREE KINDS (D142). Stated POSITIVELY, never as "everything that is not held back": a snapshot
   from before D142 holds rows with no kind, and a fail-open filter would publish them under a
   heading that promises one of these. */
export const jobs = (data as Job[]).filter((j) => isKind(j.kind)).sort(byScore);
/** The AI group, both AI kinds, and the supply-chain group, shown apart on the page. */
export const aiJobs = jobs.filter((j) => j.kind !== 'supply-chain');
export const supplyChainJobs = jobs.filter((j) => j.kind === 'supply-chain');

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
