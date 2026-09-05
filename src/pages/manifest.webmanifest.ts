/**
 * /manifest.webmanifest — generated, not hand-kept.
 *
 * WHY THIS MOVED OUT OF public/. Same reason as humans.txt: it held its own hand-typed
 * description of Ian, which drifted from `site.ts` when D42 repositioned the identity.
 * A file in public/ is copied verbatim and can never READ a value, only carry a copy of
 * one, so the drift was guaranteed rather than unlucky. LEDGER L-196.
 *
 * This is the description that names the site when someone installs it to a phone home
 * screen, which is a place a stale framing is unusually hard to notice and unusually
 * durable once it is there.
 *
 * The two colours below, and BaseLayout's theme-color meta, all read src/data/palette.ts
 * now. They were three hand-typed copies of global.css sitting behind a deferred-work marker
 * that named the upgrade path and then did not take it.
 */
export const prerender = true;

import { site } from '../data/site';
import { palette } from '../data/palette';

export function GET() {
  const manifest = {
    name: site.name,
    short_name: site.shortName,
    /* TWO SENTENCES, and no case surgery on the role line. The first attempt
       lowercased its first character to splice it mid-sentence, which turned "AI"
       into "aI" — an initialism does not survive that, and the built output said so.
       Reading the file that was actually generated is what caught it. */
    description: `${site.author}'s public workspace. ${site.roleLine}`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    /* Derived. These two were the deferred work on this file — literal hexes
       duplicating global.css, with a third copy in BaseLayout's meta tag. Recording a
       known duplication is not fixing it, so they read the tokens now. */
    background_color: palette.canvas,
    theme_color: palette.themeColor,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  });
}
