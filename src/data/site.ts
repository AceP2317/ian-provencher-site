// Site-wide metadata — a single source of truth for identity + social links.
export const site = {
  name: 'Ian Provencher',
  shortName: 'Ian Provencher',
  domain: 'ian-provencher.com',
  url: 'https://ian-provencher.com',
  author: 'Ian Provencher',
  // D42 repositioned the site identity from "builder" to "AI orchestrator" and moved
  // resume.ts, about/, job-profile.ts and the cover-letter voice-frame together — but
  // it never reached HERE, so the front door and every page title still said "builder"
  // while four other surfaces said orchestrator. This completes that move rather than
  // reopening it. D42's own principle holds: orchestrator is the FRAME, the shipped work
  // is the PROOF, and the engineering evidence stays.
  //
  // The supply-chain depth is deliberately GROUND, never SCOPE — operator's explicit
  // call: he is versatile by disposition and does not want to be read as domain-bound.
  //
  // SUPERSEDED 2026-09-26 (D80), on his pick. His job target moved to planning roles that
  // pay for AI and AI-lead roles at manufacturers, and his own framing became the OVERLAP
  // of the two: "the supply chain depth with AI technical skills and knowledge of how to
  // apply it". He was shown that this puts supply chain in the headline, against the rule
  // above, and chose it. The wording reuses /about's published lead rather than a new
  // phrasing. Every surface still READS these three fields; none may retype them.
  role: 'Supply-chain operations and applied AI',
  // Renders in the footer on EVERY page and in the structured data search engines read,
  // so it has to hold the same plainness as the hero. No adjective, no verb of
  // achievement, no "whatever the problem happens to be" — that carried a swagger the
  // rest of the page deliberately does not.
  tagline: 'I work in supply-chain operations and direct AI to build the software it needs.',
  /**
   * THE ROLE LINE, IN ONE PLACE, BECAUSE IT WAS IN FOUR.
   *
   * MEASURED 2026-08-26: this file called itself a single source of truth for identity
   * while three other files carried their own hand-typed description — humans.txt, the
   * web manifest, and the index AI crawlers read. All three led with "Supply-chain
   * operator" while `role` above said "AI orchestrator", so the site shipped two
   * framings and anything summarising it could pick either. That is LEDGER L-196
   * exactly: a value documented as single-source with hand-typed copies beside it.
   *
   * BOTH HALVES ARE TRUE AND THE ORDER IS THE ARGUMENT. Operator's own call: merge
   * them rather than choose. Until 2026-09-26 orchestration led and the operations depth
   * sat "underneath" it as ground. D80 reversed the order on his pick: the operations
   * lead, and directing AI is how their software gets built, the same overlap `role`
   * above names.
   *
   * The three files now READ this instead of restating it, so they cannot disagree
   * again. That is the assertion that closes the class rather than another correction
   * that goes stale.
   */
  roleLine:
    'Supply-chain operations and applied AI — I direct AI to build the software those operations need.',
  description:
    "Ian Provencher's public workspace — the builds, repos, cron jobs, apps and architectures he actually runs, plus field notes.",
} as const;

// Public profiles — used for JSON-LD `sameAs`, the footer, and the About "Connect" row.
export const socials: { label: string; href: string }[] = [
  { label: 'GitHub', href: 'https://github.com/AceP2317' },
  { label: 'AppliedIQ', href: 'https://appliediqsolutions.com' },
  { label: 'Nextdoor', href: 'https://nextdoor.com/page/appliediq-solutions-new-bern-nc/' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/ian-provencher' },
];

export const sameAs = socials.map((s) => s.href);
