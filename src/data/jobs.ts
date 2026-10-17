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
  /** How the row reached the board: 'remote', 'hybrid', 'local', 'both', or 'unverified' (D81). */
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
   * Which board section this belongs to, since the 2026-09-26 retarget (D75).
   * 'planning' = SAP planning, IBP, master-data and supply-chain planning roles at any employer;
   * 'ai-lead' = AI programs and products, AI business-partner and no-code automation roles at
   *             makers and distributors (D97; MES is no longer a target).
   * Each is ranked separately with its own cap and floor so neither buries the other.
   * Rows written before D75 carry 'orchestrator', 'domain' or 'supply-chain' (or nothing) and
   * belong to a target that no longer exists, so the page does not render them.
   */
  track?: 'planning' | 'ai-lead' | 'orchestrator' | 'domain' | 'supply-chain';
}

const byScore = (a: Job, b: Job) => b.score - a.score;

/* The two sections, each independently ranked. Stated POSITIVELY, never as "everything that is
   not the other one": a snapshot from before the retarget holds rows for the old target, and a
   fail-open filter would publish them under a heading that promises the new one. */
export const planningJobs = (data as Job[]).filter((j) => j.track === 'planning').sort(byScore);
export const aiLeadJobs = (data as Job[]).filter((j) => j.track === 'ai-lead').sort(byScore);

/** Every posting the board shows, both tracks — used for search indexing and the total count. */
export const jobs = [...planningJobs, ...aiLeadJobs].sort(byScore);

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
  score >= 85 ? 'var(--color-cyan-2)' : score >= 70 ? 'var(--color-accent)' : 'var(--color-label)';
