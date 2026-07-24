---
title: "On Sonnet 5, turn thinking OFF for structured extraction"
description: "Newer models default to adaptive thinking, which quietly eats your token budget. For 'pull these fields out of this text' work, disable it and set effort low."
category: "ai"
publishedAt: "2026-07-08T10:30:00-04:00"
tags: ["ai", "anthropic", "prompting", "cost"]
---

Here's a default that surprised me and cost some clarity to untangle: on Claude
Sonnet 5, **omitting the `thinking` parameter runs *adaptive* thinking** — it's on
by default. That's the opposite of the Opus 4.x family, where omitting it means
thinking is off.

For a chat or a hard reasoning task, adaptive thinking is exactly what you want.
But for **structured extraction** — "read this page and emit these six fields as
JSON" — there's no reasoning to do, and adaptive thinking silently spends part of
your `max_tokens` budget *before* the model emits the answer. On a small
`max_tokens`, that can truncate the tool call you were forcing, and you get an
empty or clipped result with no obvious cause.

The fix is explicit, and it's Anthropic's own documented starting point for
extraction / classification work:

```jsonc
{
  "model": "claude-sonnet-5",
  "thinking": { "type": "disabled" },   // don't let adaptive thinking eat the budget
  "output_config": { "effort": "low" }, // cheapest, fastest — a separate knob
  "tool_choice": { "type": "tool", "name": "emit_fields" }
}
```

Two things worth internalizing:

- **`thinking` and `effort` are separate knobs.** Disabling thinking doesn't make
  `effort` redundant — the pairing `thinking: disabled` + `effort: low` is the
  recommended config for extraction, not a belt-and-suspenders accident.
- **A forced tool call composes with disabled thinking on the first-party API.**
  The rule that forced `tool_choice` *requires* `thinking: disabled` is
  Bedrock-only; on `api.anthropic.com` it just works either way.

Net: for extraction, disable thinking on purpose. Don't inherit a default that
was tuned for a different job.
