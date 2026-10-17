---
title: Plan mode, enforced
description: Anthropic tells you to plan first, be interviewed, and build in a fresh session. Instructions are advisory; hooks are not. The full pipeline, stage by stage, from the session that planned it.
publishedAt: "2026-10-12T20:50:00-04:00"
source: authored
tags: [claude-code, workflow, ai, build]
draft: false
story: intent-lock
---

The LinkedIn version of this ran under the headline "You're using Claude Code wrong." Here is what that means, how the fix works down to the hook payloads, and the evidence behind it.

## Anthropic already wrote the advice

Anthropic's [Claude Code best practices](https://code.claude.com/docs/en/best-practices) say three things plainly. Explore and plan before coding, because "letting Claude jump straight to coding can produce code that solves the wrong problem." For larger features, "have Claude interview you first" and write a spec. Then "start a fresh session to execute it."

The same page says why most setups never get the benefit:

> Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens.

Planning, the interview and the fresh session all arrive as advice, and advice gets skipped on a busy afternoon. The model is not a reliable judge of when to ask either. [Ambig-SWE](https://arxiv.org/abs/2502.13069v3) (ICLR 2026) found that "models struggle to distinguish between well-specified and underspecified instructions." When they asked instead of assuming, performance improved by up to 74% over the non-interactive setting. [Ask or Assume?](https://arxiv.org/abs/2603.26233) (EMNLP 2026) separated the asking from the coding and resolved 69.40% of deliberately vague tasks, significantly better than a standard single agent.

So the wrong part is not skipping plan mode. It is leaving the interview to the model's judgement and the user's patience.

## The pipeline

One setting and four hooks turn the advice into a pipeline, and a fifth piece is built into Claude Code itself:

- **Plan mode is the default,** so every session starts read-only.
- **A prompt hook** loads the interview method on the first planning turn.
- **A question hook** refuses any decision box I could not answer well.
- **An exit hook** refuses to leave plan mode until the plan is sealed with an intent I confirmed.
- **A handoff hook** opens a fresh auto-mode window on approval, with its first prompt already set to `/goal` and the plan's done line.
- **The `/goal` judge,** a small separate model, grades the build against that line after every turn.

Scroll the eleven stages below. The dark panel follows you and shows the state at each one: the mode, the window doing the work, the round, the open items, the exit gate, the tokens in context and the tokens read so far across both windows. Every figure in it was read from the session that planned this page, or measured on the machine that ran it.

<!-- story -->

## Right the first time, and why that is the real saving

Stage 11 is the smaller half of the argument: the handoff read 31.7% fewer tokens than the same build in one window, with both windows counted. The larger half is the work that never had to be redone.

Anthropic's own page names the mechanism. "Claude's context window fills up fast, and performance degrades as it fills." When it fills, "Claude may start 'forgetting' earlier instructions or making more mistakes." And: "If you've corrected Claude more than twice on the same issue in one session, the context is cluttered with failed approaches. … A clean session with a better prompt almost always outperforms a long session with accumulated corrections."

That is drift. Without the interview, the first build is aimed at an assumed intent, and the correction arrives after the work exists, inside the same window. Every round of rework then re-reads the whole build, the failed attempt and the correction. Each round makes the context bigger and the original instruction a smaller share of it, which is exactly when the model starts forgetting it. Iterating on a bloated context costs more per round and lands less accurately each time.

The interview moves those corrections to the cheapest point in the job. Here they happened at planning size, between 100,000 and 195,000 tokens per request, before anything was built: the headline argument, the two audiences, the scope of the kit and the restatement I could not see. The whole interview read 11.8 million tokens. At the size this build finished, every request re-reads 404,305 tokens, so thirty requests of rework there would read about 12 million. That is the price of the entire interview, spent on a single round of fixing.

What it bought, in time and in quality:

- **The interview took 42 minutes,** my reading and answers included, from my first message at 13:14 to the approved plan at 13:56.
- **The build ran for 39 minutes without me,** from 13:56 to 14:35, and stopped with all six of its checks met, confirmed by a separate judge reading the transcript.
- **No intent was reworked.** What changed afterwards was new asks (more technical depth, a page that moves) and one factual fix I caught: plan mode is my default, not something to switch on. None of it corrected a misunderstood intent.

## The record

The proof is the conversation that planned this page: five rounds, eighteen questions, and an open list that went from six items to four to none. Everything here is from the visible record: my messages, Claude's replies, the question boxes and my answers. A few private lines are blacked out and marked, which was one of my answers in round five.

**Round one** opened on my message: "I am toying with the idea of making a linkedin post with the headline idea of 'You're using Claude Code wrong'. Then it would showcase my full intent-lock workflow in detail."

Claude did not start drafting. It took the long branch and pushed back on the headline first:

> **It draws the wrong crowd.** The people who react to it are developers who use Claude Code. ██████████████████ *(redacted)*

I kept the headline, asked for full mechanics with a flow visual, and asked for proof even if it came from outside our own sessions.

**Round two** followed what round one opened. Claude read Anthropic's page and both papers before quoting a number from either, and dropped one figure that appeared only in a secondary summary. The thesis question, with every option in the four-beat shape:

> **What should the post say is the 'wrong' part?** This becomes the spine of the post, and it decides how you answer a reader who says 'this is just plan mode'.
>
> - **Advice instead of a gate (Recommended).** The post argues that Anthropic already tells you to plan and be interviewed, but leaves it optional. It differs by quoting Anthropic's own line that instructions are advisory while automatic scripts guarantee the step happens. You will see a post whose answer to 'just plan mode' is already built in. You give up some simplicity, because the reader has to follow the gap between advice and enforcement.
> - **Letting the AI decide it's ready.** The post argues that the model cannot tell when your request is vague, so it should never judge its own readiness. It differs by leading with the research finding instead of Anthropic's docs. You will see a research-led post where the gate's empty-list rule is the answer. You give up the familiar hook of Anthropic's own advice.
> - **Skipping the questions at all.** The post argues that people let the AI start building straight away. It differs by aiming at the widest and least experienced group of users. You will see the simplest version of the argument. You give up the experienced builders, who will reply that they already use plan mode.
> - **All three, in sequence.** The post walks from skipping, to advice, to the AI judging itself. It differs by stacking every argument in one piece. You will see the most complete case. You give up length, because LinkedIn hides everything after the first few lines behind a 'see more' click.

I picked the first. **Rounds three to five** settled the review gate, the giving-up point, the scope of the public kit, this session as the worked example, how to treat private lines, and how far the handoff goes on Mac and Linux. Round four is where I said I had never seen a restatement, and round five is where the restatement moved inside the question and I confirmed it.

## Take it

The kit is public: [github.com/AceP2317/intent-lock](https://github.com/AceP2317/intent-lock). It holds the interview skill, the question rules and the four hooks: the method loader, the question guard, the exit gate and the handoff. Install takes three steps. It is a lighter cut of what runs here: its exit gate checks the plan's own watch-or-walk line rather than reading the answer from the transcript, and it has no helper-agent check.

It ships with two kinds of proof. A test suite runs every hook against fixtures in both directions, 62 checks as of 13 October, and every refusal has a twin that must pass. The 19 added on 13 October came from two fixes. The first: the handoff had read only a bold done line, so a plan that wrote it plainly opened its fresh window with no grader. The exit gate now refuses a walk-away the handoff cannot grade. The second: without Windows Terminal, a launch path holding a space reached PowerShell in two pieces, and on either route the hook reported the window open without checking. It now quotes the path and reports the window only once it has started. A live test runs two real headless Claude Code sessions in a throwaway project whose only settings are the kit's hooks. The gate must refuse an unsealed plan and allow a sealed one.

One thing the live test turned up for anyone building on this: a headless run does not offer the plan-exit tool at all unless something is wired to answer its approval prompt. The kit's live test brings a stand-in approver, a small MCP server, for exactly that.
