---
title: Plan mode, enforced
description: How my Claude Code setup holds planning to rules and hands each approved plan to a fresh window to build, as it runs on 13 November 2026.
publishedAt: "2026-10-12T20:50:00-04:00"
updatedAt: "2026-11-13T23:45:00-05:00"
source: authored
tags: [claude-code, workflow, ai, build]
draft: false
story: plan-mode
---

## In one minute

[Anthropic's guide to Claude Code](https://code.claude.com/docs/en/best-practices) recommends two habits: have Claude interview you before it builds, and build the result in a fresh session. In my setup both are rules that hooks hold, rather than advice the model may skip.

A hook is a script Claude Code runs at a fixed moment, such as just before a tool call, and it can refuse that call. Three hooks do the holding here. One refuses to leave plan mode until the plan is sealed with a confirmed intent and a proof for every step. One refuses a question I could not answer well. One opens the fresh build window when I approve.

The point is drift and cost. A build aimed at a guessed intent gets corrected after the work exists, and every later request re-reads the mistake and the fix. The interview moves those corrections to before anything is built.

Every hook fails open. When one cannot read its input, it lets the action through and says so on screen, so a check that could not run never looks like one that passed.

This page describes the setup as it runs on 13 November 2026. One model now plans and another builds, and that split is on trial until a review on 27 November. The kit is public and MIT licensed, and its tests run every hook in both directions.

## Detail A. Plan mode and the method

Every session starts in plan mode, from one line in my Claude Code settings: `"defaultMode": "plan"`. In plan mode Claude reads, searches and asks, and nothing that changes the machine runs until I approve a plan. Anthropic's guide starts new sessions in auto mode instead, where a classifier judges each risky action before it runs. Every stage on this page decides when plan mode ends.

On the first planning turn, a `UserPromptSubmit` hook puts the interview method into Claude's context. Claude Code runs that hook on every prompt and hands it the session's state as JSON. It acts only when the permission mode is `plan` and a person is at the keyboard. The whole method goes out once per session, and later prompts get a short reminder.

Size matters here. Past 10,000 characters, Claude Code shows the session a 2 KB preview and a file path instead of a hook's output. A guard refuses any commit that grows the method to that size, because a method cut to its first page reads like a whole one.

Claude then sizes the interview to the ask, and says which branch it took, so a wrong call costs one word to fix. With fewer than three open unknowns, it names what it assumes in one sentence and moves on. With three or more, it runs full rounds. A method that interrogates a typo fix gets switched off, so the short branch matters as much as the long one.

On the long branch the order is fixed. Claude first asks what the code cannot answer: who the work is for, why it is needed, and what it must not be. Then it designs the best mechanism from the goal alone, before reading what the build would touch. Only then does it explore, holding what exists against that design. Read the code first, and the design becomes a patch on whatever is there.

Helpers do the exploring. A helper is a separate Claude session that can only read, and it reports back a summary. While any helper is still out, a hook refuses every change to the machine, by every tool. It exists because a session once rewrote a stylesheet, committed it and pushed it thirteen minutes before its own research came back.

## Detail B. Questions I can answer

Every decision reaches me as a question box: a question with a few named options, one marked as recommended. A `PreToolUse` hook reads every question and option before the box is drawn. When it refuses one, the reason goes back to Claude, which rewrites the box.

It refuses three kinds of box. One whose header or option label names a file, a function or a flag, because I choose by what a thing does. One whose options run shorter than five sentences, because each option owes five beats: what happens, how it differs, what I will see, the cost in numbers, and what that cost means for me. And one that points at reply text, such as "the restatement above".

That last rule came from this page's first planning session, on 12 October. Twice it asked whether "the restatement above" matched what I wanted, and the second time I answered that I never see the statement I am asked about. The box draws over the bottom of the screen, and the paragraph above it had scrolled out of view. So the restatement of the whole build now goes inside the box's own question, where it cannot be missed.

The hook counts sentence endings and matches words. It cannot tell whether an option actually teaches the choice, so that half stays with the method.

Between rounds, Claude shows a numbered list of what is still open. Tensions, where one answer sits badly against another or against the code, come before assumptions, because settling one usually changes the build. The long branch runs at least two rounds, because a first round returns answers nobody has had time to be surprised by.

## Detail C. The seal and the exit gate

When the list is empty and I have confirmed the restatement, Claude writes the plan. It opens with an Intent section: who it is for, what it is, what it is not, why it is needed, how it runs, and what done looks like. A seal line follows, `<!-- INTENT-LOCK:CONFIRMED -->`, and then my answer to the last question, as a line of its own.

Every step and every check in the plan ends with one command that proves it. The item counts as done when that command, run exactly as written, exits clean. Nothing in it may hide its exit code: no pipe, no `|| true`, no leading `!`. A plan that builds also carries a From zero section, with the design worked out from the goal alone and a keep, replace or remove for each piece it touches.

Saving a sealed plan runs a precheck that lists everything the exit would refuse, all at once, so the first exit passes. It exists because 52 of 85 plans in the 30 days before it were refused at least once at the exit.

Then the exit gate. A `PreToolUse` hook on `ExitPlanMode`, the call that asks me to approve, runs before the approval prompt is drawn. It lets the plan through only when no helper is still out, the seal stands over an Intent of 40 words or more, every item carries a proof that can fail, the From zero section is there, and the plan's answer line matches the answer I gave in the box. The gate reads that answer from the box's recorded answers, never from its text, because the text repeats a question that names every choice.

The proof rules live in one plan reader, the same code the completion meter counts with, so the gate and the count can never read a plan differently. How the count works is the subject of [The completion meter](/blog/completion-meter/). When the gate cannot read what it needs, it lets the exit through and says so, on my screen and to Claude.

## Detail D. Why both answers open a fresh window

The last question before approval is whether I will watch the build or walk away from it. Until 13 November, watching kept the build in the planning window. That window had already read the whole interview, and Claude Code sends a session's full context with every request. So every request of a watched build paid to read the planning conversation again.

Now both answers open a fresh window. A `PostToolUse` hook on `ExitPlanMode` runs after I approve, and Claude Code hands it the approved plan's path. The new window opens in auto mode, in the same folder, with the plan's path as its first words, and it starts from the plan alone.

<figure class="d-fig">
<pre>PostToolUse   ExitPlanMode
plan line     &lt;!-- INTENT-LOCK:WATCH --&gt;
opens         claude --permission-mode auto
              "Carry out the approved plan at …"
grader        none, the person is watching</pre>
<figcaption>What the hook reads, and what it starts, for a watched plan.</figcaption>
</figure>

The two kinds of window differ in what holds the build to the plan. A walked-away window opens with `/goal` as its first prompt. After every turn a separate model checks whether the goal is met, and in my setup the goal is the completion meter's tally reaching its last line. A watched window has no grader. Its first prompt says the person who approved the plan is present, and it stops to ask me at each watch stop the plan names, and before anything the plan does not cover.

They also open differently. A walk-away launch is a command Claude runs in view, so it lands in the transcript, and it fires only for the plan exit the gate allowed: the gate leaves a record naming that exit by the call's own id, and the hook spends it, so a stale record never fires on the next day's plan. The first watched plan approved this way asked the planning session to run the same command with no grader behind it. Claude Code's auto-mode safety check refused that run, naming "Undermining Oversight", because it refuses a session that opens a build window nothing grades. So for a watched plan the approval hook now runs the launcher itself, at my click, and the planning session runs nothing. This page's own build window was opened that way.

One more answer stays open in my setup: build here, which keeps a single plan in the planning window, on the planning model. The kit has no third answer. It has a setting that keeps every watched build in the planning window, and in a run with nobody present, such as `claude -p`, it opens nothing at all.

## Detail E. A guide on call

A plan is short, and every line of it steers the build, so it is worth the stronger model. A build is long, and most of its requests are routine. Because the build runs in a window of its own, the two can run on different models. In my setup {{watch.planning.model}} plans, and the build window runs on {{watch.build.model}}.

The build keeps a way back to the stronger model. Claude Code's [advisor](https://code.claude.com/docs/en/advisor) lets a session consult a second model, which reads the whole conversation, every tool call and result included, and answers with advice the session applies before it goes on. My build windows open with {{watch.build.guide}} as that guide. Their first prompt says when to ask: before leaving the plan's path, when the same check fails twice, and before reporting the plan done.

Anthropic's page sets the rules. A guide "must rank at or above your session's main model". A guide set for one session with `--advisor` that the session cannot take makes Claude Code exit with an error at launch. The kit passes `INTENT_LOCK_GUIDE_MODEL` with `--advisor` to the build windows it opens, and to no other session. On Windows, when such a window ends in an error, the kit prints one line naming that setting to unset.

The feature is marked experimental, and it "requires the Anthropic API or Claude Platform on AWS". The split itself is on trial. A review is set for 27 November 2026, and this page gains its figures then, as a dated revision.

## Detail F. What this page's own build measured

This page was planned and built under the setup it describes, and the two windows' session logs give its figures. Tokens here are each request's input, cache reads and cache writes, counted once per request.

The planning round ran on {{watch.planning.model}}. From entering plan mode to the approval that opened the build, it sent {{watch.planning.requests}} requests and read {{watch.planning.read}} tokens. It asked {{watch.planning.questions}} questions in {{watch.planning.boxes}} boxes, and sent {{watch.planning.helpers}} helpers to read the code and Anthropic's pages. That window had planned another job earlier in the day, so its first request of this round already carried {{watch.planning.firstCtx}} tokens. The round holds more than planning, too. The plan was approved {{watch.planning.approvals}} times, because the first approval's launch was refused and the fix in Detail D was built before the second. Its last request carried {{watch.planning.lastCtx}} tokens.

The build window ran on {{watch.build.model}}, with {{watch.build.guide}} on call. It started at {{watch.build.baseCtx}} tokens per request, its own setup. By {{watch.build.cut|et}} on {{watch.build.cut|day}}, it had sent {{watch.build.requests}} requests reading {{watch.build.read}} tokens, and asked its guide {{watch.build.guideCalls}} times. That build also changed the public kit, so not every request was this page's.

Had the build stayed in the planning window, each of its requests would also have carried that window's conversation: {{watch.carry}} more tokens each, {{watch.extra}} more in all. That is {{watch.extraPct}}% more than the build window read. It is counted the way the first version of this page counted it, and it leaves out the rework the interview moved earlier, which no log counts.

## The record

| Rev | Date | What changed |
| --- | --- | --- |
| A | 12 October 2026 | The first version: the interview, the exit gate, and a fresh window for a walk-away build. |
| B | 31 October 2026 | Every step carries a proof, a sealed plan is prechecked when saved, and the walk-away goal became the completion meter's tally. |
| C | 13 November 2026 | Both answers open a fresh window, and one model plans while another builds with the first on call. The split is on trial until a review on 27 November. |

## Take the kit

The kit holds the interview skill, the question rules and four hooks: the method loader, the question guard, the exit gate and the handoff. It installs in three steps, and its test suite runs every hook on your machine, each refusal beside a twin that must pass.

It is a lighter cut of what runs here. Its question guard asks four sentences of an option rather than five, it has no helper hook, and a walked-away build is graded against the plan's DONE line, because the kit has no completion meter. A watched build opens a fresh window too, and one setting keeps it in the planning window instead. The kit names no model: the guide comes from Claude Code's own `/advisor` setting, or from `INTENT_LOCK_GUIDE_MODEL` for build windows alone.

[From plan to proof](/blog/plan-to-proof/) traces one job through both windows.

[github.com/AceP2317/intent-lock](https://github.com/AceP2317/intent-lock)
