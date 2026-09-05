---
title: Putting up the workspace
description: Why this site exists, and the one rule it's built on — every part of it can grow without a rewrite.
publishedAt: "2026-07-07T09:00:00-04:00"
source: authored
tags: [meta, build, architecture]
draft: false
---

Most personal sites are a résumé with better fonts. I wanted the opposite: a public workspace that shows the actual machinery — the repos I build in the open, the tools I run, the schedules that run themselves, the architectures behind all of it — without me re-typing any of it by hand.

So the rule this site is built on is simple: **it never duplicates the truth.** The data already lives somewhere I maintain it — my command center, my infrastructure, GitHub. This site is a render layer over that, published through a gate that only ever lets the safe parts out.

## Everything, one tile at a time

The home page is a grid of sections. Some are live; most say *in build*. That's not a placeholder apology — it's the design. Adding a new section is one line in a registry file. The navigation, the landing grid, and even the "in build" page all read from that one list. Nothing is a rewrite; everything is additive.

It means I can put the skeleton up today and let it fill in for months — a new architecture diagram here, a pinned article there, a field note like this one — without ever tearing anything down.

## What's real so far

The [architectures](/architectures/) are interactive: click a node, step through how the thing actually works. The [tools](/tools/) are the real kit, linked to the live demos where they exist. The [repos](/repos/) are whatever I've got public.

The blog you're reading — and a news feed, a favorites board, and a window into my command center — are next. This is the first note. More when there's something worth writing down.
