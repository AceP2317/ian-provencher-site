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
    // BE CLEAR WHAT THE SPLIT DOES AND DOES NOT BUY. The dynamic-import lever was already
    // spent: both scenes sit behind React.lazy AND client:visible, so a visitor who never
    // opens an architecture page downloads none of this either way. Splitting changes the
    // FILE COUNT, not the bytes on the wire — three groups fetched in parallel and cached
    // independently, instead of one chunk that any change to any part of invalidates
    // whole. It is a caching improvement, not a performance claim.
    //
    // MEASURED 2026-08-07, `npm run build` on a clean dist:
    //     three           697,800 B   <- still over 500 kB on its own
    //     react-three     396,869 B
    //     three-examples   20,397 B
    // three's core is one module graph; no package-boundary split gets it under 500 kB,
    // so the stock limit can only ever be noise here. 750 is set against the measured
    // 698 — enough headroom to be stable, little enough that a real regression (or a
    // three release that grows meaningfully) trips it again. Re-measure before raising
    // it further; raising it to make a warning go away is how this stops being a signal.
    build: {
      chunkSizeWarningLimit: 750,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return;
            // Order matters: the examples/jsm test must precede the bare `three`
            // test, because those paths contain "three" too and would otherwise all
            // land in the base chunk — which is the split not happening at all.
            if (id.includes('three/examples/jsm')) return 'three-examples';
            if (id.includes('@react-three')) return 'react-three';
            if (id.includes('node_modules/three/')) return 'three';
          },
        },
      },
    },
  },
});
