---
title: 'Put your cache breakpoint on the last block that never changes'
description: 'Why prompt caching silently fails when your breakpoint sits on a timestamp or per-request block, and where to move it instead.'
category: 'ai'
publishedAt: '2026-07-23T05:09:16-04:00'
tags: ['prompt-caching', 'claude', 'llm', 'cost']
---

The mistake I keep seeing with prompt caching is putting the breakpoint on the block that changes every request — the one carrying a timestamp, per-request context, or the incoming user message. When that block moves, the prefix hash moves with it, so you pay for a fresh cache write every time and never get a read.

Caching only writes an entry at your breakpoint, and reads only look backward for entries earlier requests actually wrote. It does not scan behind the breakpoint for stable content to cache on your behalf. So the fix is to move `cache_control` to the last block that stays identical across the requests you want to share a cache — the end of your static prefix (tools, system, examples), not the varying suffix.

A cheap way to confirm it's working: check the response usage. If both `cache_creation_input_tokens` and `cache_read_input_tokens` come back 0, nothing cached — often because you're under the model's minimum length or your breakpoint keeps shifting.

```python
system = [{
    "type": "text",
    "text": STATIC_SYSTEM_PROMPT,   # unchanging prefix
    "cache_control": {"type": "ephemeral"},
}]
# per-request text goes in messages, AFTER the breakpoint
```

One catch with automatic caching: it drops the breakpoint on the last cacheable block, which in this shape is the block that changes. For a varying suffix, use an explicit breakpoint on the static tail instead.

Details in the [Claude Platform Docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching).
