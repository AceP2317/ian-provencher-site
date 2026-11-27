---
title: From plan to proof
description: My Claude Code setup as one system, from the first prompt to the line that says the build is done, traced through every part on the job that wrote this post and the three beside it.
publishedAt: "2026-10-31T10:02:00-04:00"
source: authored
tags: [claude-code, workflow, ai, build]
draft: false
story: plan-to-proof
---

The other three posts in this series each take one part apart. [Plan mode, enforced](/blog/intent-lock/) is the planning half, [The completion meter](/blog/completion-meter/) is the proof half, and [The HUD](/blog/hud/) is the instrument I watch while either runs. This one puts them back together and follows a single job through all of it.

The job is the one that produced these four posts. It started as a message in a plan-mode session, became a plan with sixteen numbered items, and was built by a fresh window I walked away from. Every figure in the story is that job's own record, read from the two session logs by a script that re-derives each one and traces every number in the posts to its source.

## The shape of it

Two windows, one file between them, and a line of code at the end.

The planning window cannot change anything. It interviews me, sends helpers to read the code, and writes a plan whose every item names the command that proves it. Hooks check its work at each step. One refuses a question I could not answer well, and another refuses to let it leave plan mode with a plan that is not finished.

The build window starts clean. It gets the plan file and a goal, and nothing else from the planning conversation. It builds, runs each proof, and asks the meter for a tally. A separate model reads the conversation after each turn and stops the build only when the tally's last line says it is done.

<!-- story -->

## What the system does not do

It does not make the plan right. The interview makes it more likely, and the gate makes it complete, but a plan whose proofs check the wrong thing is proved by checking the wrong thing. The defence is a control beside each check, an input that must fail it. In this plan, the story walker must catch keys that do nothing and a planted error, and the figures check must catch a planted wrong value and a number with no source.

It does not remove me. Two decisions stay mine by design: the plan's intent, confirmed in a box before it is sealed, and the go at the end. Everything between them runs without me, and I read the result before it goes anywhere.

It does not stop a build that is going wrong quickly. The only automatic stops are the ones the plan writes down. This plan's are six hours of building, or a story that still fails its walk after three rounds of fixes. Inside those limits the meter counts proofs and the HUD shows usage. A build spending its allowance on a bad approach shows on the strip, and stopping it is a person's call.
