// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://ian-provencher.com',
  // Canonical URL form is trailing-slash (matches sitemap + canonicals + the
  // Cloudflare assets layer, which 307s the slash-less form). 'always' makes the
  // dev server 404 slash-less internal links so a missed slash surfaces in dev.
  trailingSlash: 'always',
  // Pinned static dev/preview port (workspace port convention — see dev\PORTS.md).
  server: { port: 4300 },
  /* SYNTAX HIGHLIGHTING WAS STILL DARK, AND NOTHING SAID SO.
     No theme was configured, so Astro's default `github-dark` applied — which was
     invisibly correct for as long as the site was dark and became a near-black slab
     on a white page the moment it was not. MEASURED 2026-08-26: three built pages
     shipped `background-color:#24292e` inline on their code blocks, which is also
     why those were the only pages carrying a colour outside the token set.
     Named explicitly now rather than left to a default, so the next person to change
     the palette can see that this has to move with it. */
  markdown: { shikiConfig: { theme: 'github-light' } },
  // Astro 7 changed the default to 'jsx', which drops the whitespace between inline elements
  // that Astro 6 kept. The upgrade was for security fixes, not a new look, so the 6.x
  // behaviour is kept and the pixel comparison of every page is what confirmed it.
  compressHTML: true,
  integrations: [
    react(),
    // Stamp every sitemap entry with the build time + sensible crawl hints.
    // /admin is the private content console — keep it out of the sitemap.
    sitemap({
      changefreq: 'monthly',
      priority: 0.7,
      lastmod: new Date(),
      filter: (page) => !page.includes('/admin'),
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
    // Refuse to drift off the pinned port. Vite's default is to auto-increment
    // when 4300 is taken, which silently parks a second instance of this site on
    // 4301 — appliediqsolutions' pinned port — and breaks both PWA identities.
    // Fail loudly instead: a port clash means a stale server is already running.
    server: { strictPort: true },
    // Pre-bundle the 3D stack so the architecture viewer's lazy chunk resolves
    // cleanly under the pinned Vite. three never enters the SSR graph — the r3f
    // scene is lazy-loaded and only rendered client-side after a WebGL check.
    optimizeDeps: { include: ['three', '@react-three/fiber', '@react-three/drei'] },
    // Split the 3D stack, then raise the warning floor to a MEASURED number. Both halves
    // are needed and the first one alone does not silence the warning — that was tried.
    //
    // READ THE `react` RULE BEFORE TOUCHING THIS. It is not cosmetic, and the comment it
    // replaced was WRONG ON A FACT for a year. That comment said "a visitor who never opens
    // an architecture page downloads none of this either way — splitting changes the FILE
    // COUNT, not the bytes on the wire." It measured chunk SIZES and was mistaken for a
    // measurement of what LOADS. What actually happened:
    //
    //   `@react-three/*` was claimed by a manual chunk. React is a shared dependency of
    //   BOTH that code and the header search island, and a manual chunk owns the shared
    //   dependency subgraph nothing else claims — so Rollup folded react + react-dom INTO
    //   the `react-three` chunk. Astro's React renderer (client.js, 1,870 B) then had to
    //   import that chunk to find React at all, and that chunk statically imports `three`.
    //   HeaderSearch runs client:load on EVERY page, so EVERY page pulled the chain:
    //       client.js -> react-three (396,869 B) -> three (697,800 B)
    //   Measured live 2026-08-24: the homepage had ZERO canvas elements and `window.__THREE__`
    //   was still defined. 1,094,669 raw bytes of 3D library to render a search box.
    //
    // Giving React its OWN chunk is the fix: the renderer imports `react`, and nothing but
    // the two lazy 3D scenes reaches `react-three`. VERIFY IT, never assume it — the bundler's
    // chunking is emergent and a rule that looks right can still merge. `npm run build` now
    // proves it every time: scripts/check-chunks.mjs walks every page's up-front imports and
    // fails if one reaches three, or if React's internals leave their own chunk. The browser
    // half stays by hand:  on '/',  window.__THREE__ === undefined.
    // (Until 2026-09-25 this said `grep -c createRoot dist/_astro/react-three.*.js` must print
    // 0. It printed 1 on every correct build: that chunk is one minified line holding the 3D
    // library's own createRoot and drei's call to React's, so the check could never pass.)
    //
    // MEASURED 2026-08-07, `npm run build` on a clean dist:
    //     three           697,800 B   <- still over 500 kB on its own
    //     react-three     396,869 B   <- this figure INCLUDED react + react-dom; see above
    //     three-examples   20,397 B
    // RE-MEASURED 2026-09-25 under Rolldown and the Oxc minifier (Astro 7, Vite 8):
    //     three           689,212 B   react-three 199,268 B   react 190,172 B
    //     three-examples    1,955 B
    // three's core is one module graph; no package-boundary split gets it under 500 kB,
    // so the stock limit can only ever be noise here. 750 is set against the measured
    // 698 — enough headroom to be stable, little enough that a real regression (or a
    // three release that grows meaningfully) trips it again. Re-measure before raising
    // it further; raising it to make a warning go away is how this stops being a signal.
    //
    // VITE 8 BUNDLES WITH ROLLDOWN (2026-09-25, Astro 7), and the rules moved from Rollup's
    // `manualChunks` to Rolldown's `codeSplitting.groups`. Rolldown keeps the behaviour that
    // caused the fold above: a group pulls every module its captured modules import into the
    // same chunk (`includeDependenciesRecursively`, default true). What decides which group
    // wins a shared module is PRIORITY, highest first, and a module a group claims is removed
    // from every lower one. So React is claimed first and the 3D stack last, which is the
    // same outcome the old function reached by the ORDER of its if-statements.
    build: {
      chunkSizeWarningLimit: 750,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              // React gets its OWN chunk so the Astro renderer never has to reach through the
              // 3D bundle to find it. Without this group every React island on the site drags
              // three.js along with it. Load-bearing; scripts/check-chunks.mjs proves it.
              { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 40 },
              // three's CORE is claimed before its examples, and its test excludes them. The
              // other way round, the examples group pulled the whole core in as a dependency and
              // the `three` group came out empty: measured on the first Rolldown build, one
              // 691 kB "three-examples" chunk and no "three" chunk at all.
              { name: 'three', test: /node_modules[\\/]three[\\/](?!examples[\\/])/, priority: 30 },
              { name: 'three-examples', test: /node_modules[\\/]three[\\/]examples[\\/]jsm/, priority: 20 },
              { name: 'react-three', test: /node_modules[\\/]@react-three[\\/]/, priority: 10 },
            ],
          },
        },
      },
    },
  },
});
