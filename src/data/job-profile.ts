/**
 * job-profile.ts — the target profile the Job Board fetch queries with and scores
 * against. Operator-tunable: edit the criteria below, then `npm run fetch:jobs`.
 * This is public-safe (it renders as the board's "what I'm looking for" note), so
 * keep it generic — no employer, salary you don't want public, or private detail
 * you wouldn't post. Mirrors the PROFILE in scripts/fetch-jobs.mjs — keep them in sync.
 *
 * RETARGETED 2026-09-26 (D75): planning roles that value AI skills, and AI / automation
 * lead roles at manufacturers. AI-company engineering roles are no longer a target.
 * WIDENED 2026-09-27 (D81) to every supply-chain family his tools prove, at senior
 * individual-contributor and team-lead level.
 * D97 (2026-10-09): MES is no longer a target, and the AI side counts at makers AND
 * distributors, in three kinds — AI programs and products, AI business partner, no-code automation.
 * ONE LIST (D137, 2026-11-15): only roles where AI is the main work, at any employer, with operations
 * and supply-chain depth as the qualification. One cap and one floor replace the two tracks'.
 * THREE KINDS, REMOTE ONLY (D142, 2026-11-25): AI and supply chain together, AI in operations, and
 * supply chain with no AI, every one fully remote. The places of D109 are gone.
 */
export const jobProfile = {
  /* The search terms that lived here (`roles`, `domainRoles`) moved to FAMILIES in
     scripts/fetch-jobs.mjs on 2026-09-27 (D81): one table per supply-chain family, rotated by
     weekday, each family naming the tools that prove it. Nothing on the page read these lists. */
  /** Where I'm looking: fully remote, nowhere else (D142). */
  location: {
    remote: true,
  },
  /** HARD comp floor (annualized USD). A posting whose salary is known and whose band TOP is
   *  below this is dropped outright, and since D142 a posting that lists no pay never shows. Not rendered publicly. */
  minSalary: 115000,
  /** Signals that RAISE a fit score (skills, values, must-haves). */
  wants: ['AI adoption', 'AI enablement', 'training staff to use AI', 'AI in operations', 'AI agents in operations work', 'AI programs and products in operations', 'building with AI tools', 'AI coding assistants', 'no-code and low-code automation', 'AI business partner', 'digital supply chain', 'operations and supply-chain outcomes', 'senior individual contributor', 'team lead', 'remote'],
  /** Signals that DROP a posting outright. */
  dealBreakers: ['security clearance', 'unpaid', 'commission-only'],
  /** The one list: how many top-scored postings to keep, and the fit-score floor. */
  keepTop: 60,
  minScore: 65,
} as const;

/** A one-line public summary of the search, shown on the board. */
export const profileSummary =
  'Three kinds of role, at senior and team-lead level: AI and supply chain together, AI in operations, and supply chain on its own. Fully remote, with the pay listed. Aggregated from many sources and scored for fit.';
