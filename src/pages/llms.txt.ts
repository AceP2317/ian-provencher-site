/**
 * /llms.txt — generated from the section registry so it never drifts. The intro
 * prose is authored; the Sections list is built from SECTIONS (same source the
 * nav + landing grid use), so a new section self-lists here the moment it ships.
 * Replaces the old hand-maintained public/llms.txt (which went stale).
 */
export const prerender = true;

import { SECTIONS } from '../data/sections';
/* The role line is READ, not restated. This file's own header notes that it replaced a
   hand-maintained public/llms.txt "which went stale" — and then hand-typed its own role
   line anyway, which drifted from site.ts the moment D42 moved. Same trap, one level
   down. LEDGER L-196. */
import { site } from '../data/site';

const BASE = 'https://ian-provencher.com';

const HEAD = `# Ian Provencher

> ${site.roleLine}
> Supply-chain operations underneath: material flow, planning and production.
> This site is his public workspace: reviewed, public-safe snapshots of the
> infrastructure he runs.

The site publishes Ian Provencher's repos, tools, scheduled jobs, apps and system
architectures, plus authored field
notes and two educational references (a technical glossary and leveled crash
courses). The private estate (an ops console, agent orchestration, and infra) is
never exposed live — everything published here passes an opt-in safe-export gate
that strips anything sensitive before it reaches the web. Ian also runs AppliedIQ
Solutions, a practice building custom software for small local businesses and
supply-chain tools for manufacturers.

## Sections
`;

const ELSEWHERE = `
## Elsewhere
- [AppliedIQ Solutions](https://appliediqsolutions.com): My practice — custom software for small businesses, and supply-chain tools built to order.
- [Nextdoor — AppliedIQ Solutions](https://nextdoor.com/page/appliediq-solutions-new-bern-nc/): My local business page (New Bern, NC).
- [GitHub](https://github.com/AceP2317): Public repositories.
- [LinkedIn](https://www.linkedin.com/in/ian-provencher): Professional profile.
`;

export async function GET() {
  const sections = SECTIONS
    .filter((s) => s.inNav !== false && s.slug !== '' && s.status === 'live')
    .sort((a, b) => a.order - b.order)
    .map((s) => `- [${s.title}](${BASE}/${s.slug}/): ${s.description}`)
    .join('\n');

  const body = `${HEAD}${sections}\n${ELSEWHERE}`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
