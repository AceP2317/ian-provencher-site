---
title: Plan mode, enforced
description: How my Claude Code setup plans before it builds, stage by stage at file level, as it runs on 31 October, with the 12 October record kept as where it started.
publishedAt: "2026-10-12T20:50:00-04:00"
updatedAt: "2026-10-31T10:00:00-04:00"
source: authored
tags: [claude-code, workflow, ai, build]
draft: false
story: plan-mode
---

This is the planning half of how I work with Claude Code. It ends with an approved plan and a fresh window that builds it while I am away. The proof half, [The completion meter](/blog/completion-meter/), is how that window knows when it is finished. [From plan to proof](/blog/plan-to-proof/) traces one job through both.

I first wrote this up on 12 October. The rules changed on five days between 19 October and 29 October, so this version describes the setup as it runs on 31 October. The 12 October record is kept in the story, labelled with its date, where it explains a rule.

## What Anthropic's guide says now

Anthropic has rewritten its [Claude Code best practices](https://code.claude.com/docs/en/best-practices) since my first version. New terminal and VS Code sessions now start in auto mode, "where a classifier reviews anything risky before it runs", and the page no longer mentions plan mode. The interview and the fresh session are still there:

> Ask Claude to interview you instead

> Once `SPEC.md` exists, start a fresh session to build from it, so the build begins with a clean context and a written definition of done.

The page now also sorts every instruction into two kinds. A prompt, a `CLAUDE.md` or a skill is read by the model, and "The model then decides what to do with this information." A hook, a deny rule or a managed setting is carried out by Claude Code itself, which "applies this every time, no matter what the model decided to do."

That split is the design brief for everything below. The interview is still advice the model reads. Whether planning happens, whether a decision reaches me in a form I can answer, whether a plan can be approved half-written, and when the build stops are all held by hooks and code.

## The pipeline, as of 31 October

- **Plan mode is the default,** so every session starts read-only.
- **A prompt hook** loads the interview method on the first planning turn.
- **A helper hook** refuses every change to the machine while research helpers are out.
- **A question hook** refuses any decision box I could not answer well.
- **A save hook** prechecks a sealed plan and lists everything the exit would refuse.
- **An exit hook** refuses to leave plan mode until the plan is sealed, every item carries a proof that can fail, and the plan matches my watch-or-walk answer.
- **A handoff hook** opens a fresh auto-mode window with `/goal` already set.
- **The completion meter,** a mod, counts the plan in code, and the `/goal` judge reads the one line it prints.

Scroll the stages below. The panel follows you and shows this post's own planning session at each stage: the mode, the window doing the work, where the session was, the exit gate, the context in the working window and the tokens read so far across both windows.

<!-- story -->

## What changed since 12 October

- **19 October.** Every plan item ends with the command that proves it, and the exit gate refuses a plan without one.
- **23 October.** A sealed plan is prechecked when it is saved, and the watch-or-walk answer is read from the last decision round instead of only after the seal.
- **25 October.** Options carry five beats, with cost as a number. A building plan needs a From zero section, and the method designs before it explores. Helpers became three read-only kinds that can never build.
- **26 October.** The walk-away goal became the completion meter's tally. The handoff fires only for the exit that armed it. A guard holds the method under the size Claude Code will show whole, and a gate that lets something through unchecked now says so.
- **29 October.** The rule against pointing at reply text was narrowed to what a reader actually cannot see.

## Take it

The kit is public: [github.com/AceP2317/intent-lock](https://github.com/AceP2317/intent-lock). It holds the interview skill, the question rules and four hooks: the method loader, the question guard, the exit gate and the handoff. It is a lighter cut of what runs here, and it has fallen further behind since 12 October. Its exit gate reads the plan's own watch-or-walk line instead of my answer in the transcript, it has no helper hook, and its handoff still builds the goal from the plan's DONE line, because the kit has no meter to count against.

Its test suite runs every hook against fixtures in both directions, and every refusal has a twin that must pass. As of 31 October it runs 87 checks. Since that day it also reports a check it had to skip as skipped, because until then a machine missing a tool printed the same total as one that ran everything.
