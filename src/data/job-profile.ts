/**
 * job-profile.ts — the target profile the Job Board fetch queries with and scores
 * against. Operator-tunable: edit the criteria below, then `npm run fetch:jobs`.
 * This is public-safe (it renders as the board's "what I'm looking for" note), so
 * keep it generic — no employer, salary you don't want public, or private detail
 * you wouldn't post. Mirrors the PROFILE in scripts/fetch-jobs.mjs — keep them in sync.
 */
export const jobProfile = {
  /** Search terms — each is queried; results are merged + de-duped. */
  roles: [
    'AI engineer',
    'applied AI',
    'generative AI',
    'forward deployed engineer',
    'AI solutions engineer',
    'AI solutions architect',
    'AI implementation engineer',
    'AI enablement',
    'prompt engineer',
    'AI product manager',
    'automation engineer',
    'AI operations',
    'supply chain AI',
  ],
  /** Where I'm looking — commutable to home, Research-Triangle hybrid, OR fully remote.
   *  Town-free + region-level on purpose (this file renders publicly); the precise commute
   *  anchor lives only in the private fetcher. radiusMiles is human-facing; the fetcher uses km. */
  location: {
    near: 'coastal / eastern North Carolina',
    radiusMiles: 50,
    remote: true,
    /** Triangle roles are ~2 hrs out — in scope only when the role is genuinely hybrid. */
    hybridNear: 'the Research Triangle',
    hybridOnly: true,
  },
  /** HARD comp floor (annualized USD). A posting whose salary is known and whose band TOP is
   *  below this is dropped outright. Hidden-salary postings still pass — most roles disclose
   *  nothing, and gating them would halve the board. Not rendered publicly. */
  minSalary: 115000,
  /** Signals that RAISE a fit score (skills, values, must-haves). */
  wants: ['applied AI', 'LLM', 'generative AI', 'agentic', 'prompt engineering', 'RAG', 'automation', 'forward deployed', 'solutions engineering', 'AI adoption', 'full-stack', 'TypeScript', 'Python', 'supply chain', 'operations', 'ownership', 'remote'],
  /** Signals that DROP a posting outright. */
  dealBreakers: ['security clearance', 'unpaid', 'commission-only'],
  /** How many top-scored postings to keep on the board (safety cap; minScore is the real selector).
   *  Deliberately small — a shortlist worth reading end to end beats a long list whose back half
   *  never gets opened. On a thin day the board is shorter than this, which is correct. */
  keepTop: 75,
  /** Fit-score floor for inclusion — anything below is dropped rather than used as padding. */
  minScore: 65,
} as const;

/** A one-line public summary of the search, shown on the board. */
export const profileSummary =
  'AI orchestration and applied-AI roles — forward-deployed, solutions, implementation, enablement, and AI-operations work — fully remote, hybrid in the Research Triangle, or commutable in coastal/eastern North Carolina — production LLM and agentic outcomes grounded in real operations. Aggregated from many sources and scored for fit.';
