---
title: The completion meter
description: An agent saying it is done is a claim. This is the Claude Code mod that replaced the claim with a count, where each plan item closes only when its own proof command runs exactly as written and passes.
publishedAt: "2026-10-31T10:01:00-04:00"
source: authored
tags: [claude-code, workflow, ai, build]
draft: false
story: completion-meter
---

This is the proof half of how I work with Claude Code. The planning half, [Plan mode, enforced](/blog/intent-lock/), ends with an approved plan and a fresh window that builds it while I am away. This post is about how that window, and I, know when the build is actually finished.

## The problem is the word "done"

A long agent session ends with a summary, and the summary says the work is complete. Sometimes it is. When it is not, the gap shows up later, as a check that never ran or a file that exists without the thing it was meant to prove.

Anthropic's [Claude Code best practices](https://code.claude.com/docs/en/best-practices) put it plainly:

> Claude stops when the work looks done. If it has nothing to run that tells it whether the work actually *is* done, "looks done" is all it has to go on.

The same page sorts every instruction into two kinds. A non-deterministic one is read by the model, which decides what to do with it. A deterministic one is carried out by Claude Code itself, every time. For "when it's done", it files `/goal` and "a request for evidence" under the first kind, and "Tests, typecheck, a `Stop` hook, CI" under the second. `/goal` is the condition a walk-away build runs against: a separate model reads the conversation after every turn and decides whether the condition is met. That judge is a model, so it is not deterministic either.

I measured my own setup on 19 October. Of 533 claims of done that the old meter had judged, 195 were refused. And 0 of 5 walk-away windows had counted anything at all.

## What the meter does instead

The completion meter is a Claude Code mod: code that Claude Code loads into its own engine, which can watch session events and draw on screen. It counts an approved plan, and its rules come down to one sentence. **An item is done when the main session runs that item's own proof command, exactly as the plan wrote it, and the run exits clean.**

Everything else follows from making that sentence hard to get around. The plan has to carry the proofs. The list is frozen at approval. A run that is not exactly the proof does not count, and one still running in the background does not count yet. My words close only the items that are mine, and only when they name the item. The count prints a verdict line, and the walk-away window's goal is that line.

That last part is the design. The judge is still a model, but it no longer has to decide what "done" means. Code has already counted, and the judge reads one line.

The story below walks the whole thing, using this build's own record. The panel beside it is a replica of the meter's band, the one line it draws above the prompt. The band is shown as the meter printed it at each tally while this post was being built, with the newest proof run at that moment.

<!-- story -->

## What it does not do

It does not judge whether a proof is a good one. "A proof must be able to fail" is a rule the plan's author holds, and the meter cannot see it. A plan whose proof is `true` will be proved by `true`. The defence is upstream: the planning method asks for a check whose answer moves, and the build runs a control beside each one.

It does not read output. A test runner that exits 0 after printing a failure will be counted as a pass. The meter trusts the exit code because the alternative, reading a command's text and deciding what it meant, is the claim it was built to replace.

And it is not the judge. The `/goal` judge is a separate model that reads the conversation after each turn. The meter's job is to print one line that judge can read without running anything. On 30 October the two disagreed, six times in a row, about an item handed to the next morning. The judge was right, and the build stopped only when I ended it.

## Where the code lives

The meter lives in my private setup repository, so this post quotes it rather than linking it. Its rules sit in one file of pure functions, tested by its own suite and by a replay that re-counts every recorded session and judges the count a second way. The planning half's hooks are public in the [intent-lock kit](https://github.com/AceP2317/intent-lock).
