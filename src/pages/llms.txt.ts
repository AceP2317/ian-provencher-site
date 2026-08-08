/**
 * /llms.txt — generated from the section registry so it never drifts. The intro
 * prose is authored; the Sections list is built from SECTIONS (same source the
 * nav + landing grid use), so a new section self-lists here the moment it ships.
 * Replaces the old hand-maintained public/llms.txt (which went stale).
 */
export const prerender = true;

import { SECTIONS } from '../data/sections';

const BASE = 'https://ian-provencher.com';

const HEAD = `# Ian Provencher

> Supply-chain operator who directs AI to build his own operational software.
> Years running end-to-end supply-chain operations — material flow, planning,
> production — now pointing AI at the exact problems that work throws off, and
> shipping the tools big ERP/MRP systems leave out. This site is his public
> workspace: reviewed, public-safe snapshots of the real infrastructure he runs.

Ian Provencher builds and runs operational software as a one-person operation:
repos, tools, cron jobs, apps, and system architectures, plus authored field
notes and two educational references (a technical glossary and leveled crash
courses). The private estate (an ops console, agent orchestration, and infra) is
never exposed live — everything published here passes an opt-in safe-export gate
that strips anything sensitive before it reaches the web. Ian also runs AppliedIQ
Solutions, a practice building custom supply-chain software for other teams.

## Sections
`;

const ELSEWHERE = `
## Elsewhere
- [AppliedIQ Solutions](https://appliediqsolutions.com): My practice — custom supply-chain software and AI-built operational tools.
- [Nextdoor — AppliedIQ Solutions](https://nextdoor.com/page/appliediq-solutions-new-bern-nc/): My local business page (New Bern, NC).
- [GitHub](https://github.com/AceP2317): Public repositories.
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
