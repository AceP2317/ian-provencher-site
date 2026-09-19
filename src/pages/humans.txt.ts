/**
 * /humans.txt — generated, not hand-kept.
 *
 * WHY THIS MOVED OUT OF public/. It sat there as a static file with its own hand-typed
 * role line, which drifted from `site.ts` the moment D42 repositioned the identity and
 * nothing noticed, because nothing could. Anything in public/ is copied verbatim, so a
 * file there can never read a value — it can only hold a copy of one. That is LEDGER
 * L-196 with a directory as the cause.
 *
 * As a route it reads `site.ts` and the social list, so the identity and the links are
 * stated once and this file cannot disagree with the footer, the structured data, the
 * manifest or the AI-crawler index again.
 */
export const prerender = true;

import { site, socials } from '../data/site';

const find = (label: string) => socials.find((s) => s.label === label)?.href;

export function GET() {
  const body = `/* BUILDER */
  Operator & builder: ${site.author}
  Site: ${site.url}
  Practice: ${find('AppliedIQ') ?? ''}
  Nextdoor: ${find('Nextdoor') ?? ''}
  GitHub: ${(find('GitHub') ?? '').replace('https://github.com/', '')}
  Role: ${site.roleLine}

/* SITE */
  Stack: Astro, React islands, Tailwind CSS, TypeScript
  Type: Self-hosted (no font/analytics CDNs)
  Hosting: Cloudflare Workers (static assets)
  Built with: Claude Code
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
