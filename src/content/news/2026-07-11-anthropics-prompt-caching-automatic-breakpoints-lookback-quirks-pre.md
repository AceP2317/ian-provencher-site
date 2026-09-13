---
title: 'Anthropic''s prompt caching: automatic breakpoints, lookback quirks, pre-warming'
url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-caching'
source: 'platform.claude.com'
pinnedAt: '2026-07-11T07:32:35-04:00'
summary: 'Worth keeping as a reference for actually tuning cache hit rates instead of guessing. Key things I''d forget otherwise: the lookback window is only 20 blocks, cache writes happen ONLY at the breakpoint (not retroactively on stable content behind it), and there''s now a max_tokens:0 pre-warm trick to kill first-token latency before real user traffic arrives. Also useful: exact pricing multipliers (5m writes 1.25x, 1h writes 2x, reads 0.1x base) and the table of what invalidates cache (tool defs invalidate everything; images/tool_choice only invalidate messages).'
tags: ['anthropic', 'claude-api', 'prompt-caching', 'llm-cost-optimization']
---
