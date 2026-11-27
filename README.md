# ian-provencher.com

My personal builder's site — a public, redaction-safe view of what I build: tools, architectures, repos, apps, and scheduled jobs, plus a blog and field notes.

**Live:** https://ian-provencher.com

## What's here

An [Astro](https://astro.build) site driven by a **section registry** (`src/data/sections.ts`). Each section renders from either committed public-safe data snapshots (`src/data/*.generated.json`) or an Astro content collection. The flagship interactive piece is the architecture diagram viewer.

- `src/pages/` — home + a route per section
- `src/data/` — the section registry + public-safe data snapshots
- `src/content/` — blog / news / favorites content collections
- `src/components/islands/` — the React islands (kept few)

## Stack

Astro 6 · React 19 islands · Tailwind v4 · TypeScript (strict). Self-hosted fonts via Fontsource; icons via Lucide.

## Develop

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static output to dist/
```

## Notes

This repository is a **published mirror** of my private working repo, assembled automatically by an allowlist-first, fail-closed pipeline: only the front-end (`src/`, `public/`, and build config) ships, and a whole-tree scan aborts the publish on any private detail. The data snapshots it renders are produced by a private export pipeline (**not** in this repo) that filters my private systems down to a reviewed, public-safe subset. The content admin is served by a private Cloudflare Worker, also not included here.

---

Built by [Ian Provencher](https://github.com/AceP2317).
