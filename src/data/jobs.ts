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
}

export const jobs = (data as Job[]).slice().sort((a, b) => b.score - a.score);

/** Newest-fetch timestamp isn't tracked per-record; the board notes cadence in copy. */
export const hostOf = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * Apply target — a web search for the exact role + company, so the click lands on the
 * employer's OWN posting rather than the aggregator's redirect (which can bounce through
 * Adzuna's consumer sign-in). Intentionally not the stored `j.url` for that reason.
 */
export const applyUrl = (j: Job): string =>
  `https://www.google.com/search?q=${encodeURIComponent(`${j.title} ${j.company} careers`)}`;

/** Green / amber / gray band by score, as a token reference for the score chip. */
export const scoreTone = (score: number): string =>
  score >= 85 ? 'var(--color-green)' : score >= 70 ? 'var(--color-accent)' : 'var(--color-label)';
