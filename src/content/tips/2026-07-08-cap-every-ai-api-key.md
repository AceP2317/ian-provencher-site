---
title: "Put a hard monthly cap on every AI API key"
description: "The five-minute setting that turns a runaway loop or a leaked key from a five-figure surprise into a capped, survivable one."
category: "optimization"
publishedAt: "2026-07-08T09:00:00-04:00"
tags: ["ai", "cost", "safety"]
---

Before an API key powers anything — a Worker, a script, an agent — I set a **hard
monthly spend cap** on it in the provider console. Not a budget alert. A cap that
actually stops spending.

The failure mode this guards against isn't overuse in the normal sense. It's the
loop that doesn't terminate, the endpoint that gets hit in a retry storm, or the
key that leaks and gets drained by someone else. Any one of those turns "a few
dollars a month" into a number you don't want to explain. A cap makes the worst
case *known* — you lose the feature until next month, not your budget.

A few things I've settled on:

- **One key, capped once, reused everywhere I trust equally.** A provider key is
  account-scoped, so the same key drives every project on that account under the
  same cap. I don't mint a new key per project unless I want to meter them
  separately — I just paste the capped key into each project's secret store.
- **The cap is the backstop, not the plan.** I still pick the cheap-but-capable
  model, turn off anything I'm not using, and keep request sizes tight. The cap is
  there for the day one of those slips.
- **Secrets live in the platform, never in the repo.** The key goes in the
  Cloudflare (or wherever) secret store, encrypted. If it's never in git, it can't
  leak from git.

Five minutes, once per key. It's the cheapest insurance in the stack.
