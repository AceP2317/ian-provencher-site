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
 */
export const jobProfile = {
  /* The search terms that lived here (`roles`, `domainRoles`) moved to FAMILIES in
     scripts/fetch-jobs.mjs on 2026-09-27 (D81): one table per supply-chain family, rotated by
     weekday, each family naming the tools that prove it. Nothing on the page read these lists. */
  /** Where I'm looking — fully remote, hybrid in the Research Triangle, or my own town.
   *  Region-level on purpose (this file renders publicly); the precise anchor lives only in the
   *  private fetcher. */
  location: {
    near: 'coastal North Carolina',
    remote: true,
    /** Triangle roles are ~2 hrs out — in scope for hybrid work. */
    hybridNear: 'the Research Triangle',
  },
  /** HARD comp floor (annualized USD). A posting whose salary is known and whose band TOP is
   *  below this is dropped outright. Hidden-salary postings still pass. Not rendered publicly. */
  minSalary: 125000,
  /** Signals that RAISE a fit score (skills, values, must-haves). */
  wants: ['material availability', 'shortage management', 'production planning', 'scheduling', 'capacity', 'inventory optimization', 'excess and obsolete', 'order fulfillment', 'service level', 'S&OE', 'S&OP', 'IBP', 'supply planning', 'demand planning', 'supply chain analytics', 'SAP', 'S/4HANA', 'MES', 'engineering change', 'new product introduction', 'inbound logistics', 'master data', 'digital supply chain', 'automation', 'AI', 'senior individual contributor', 'team lead', 'remote'],
  /** Signals that DROP a posting outright. */
  dealBreakers: ['security clearance', 'unpaid', 'commission-only'],
  /** The planning track: how many top-scored postings to keep, and the fit-score floor. */
  keepTopPlanning: 60,
  minScorePlanning: 65,
  /** The ai-lead track, capped and floored independently. */
  keepTopAiLead: 40,
  minScoreAiLead: 65,
} as const;

/** A one-line public summary of the search, shown on the board. */
export const profileSummary =
  'Supply-chain roles where AI and automation skills are the edge — material and production planning, inventory, order fulfillment, SAP and planning systems, engineering change, S&OP and digital supply chain — at senior and team-lead level, plus AI, automation and manufacturing-systems roles at manufacturers. Fully remote, hybrid in the Research Triangle, or local on the North Carolina coast. Aggregated from many sources and scored for fit.';
