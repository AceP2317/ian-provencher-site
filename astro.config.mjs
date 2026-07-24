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
    // Pre-bundle the 3D stack so the architecture viewer's lazy chunk resolves
    // cleanly under the pinned Vite. three never enters the SSR graph — the r3f
    // scene is lazy-loaded and only rendered client-side after a WebGL check.
    optimizeDeps: { include: ['three', '@react-three/fiber', '@react-three/drei'] },
  },
});
