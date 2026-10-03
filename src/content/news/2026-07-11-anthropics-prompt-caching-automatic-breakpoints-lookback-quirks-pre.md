---
title: 'Anthropic''s prompt caching: automatic breakpoints, lookback quirks, pre-warming'
url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-caching'
source: 'platform.claude.com'
pinnedAt: '2026-07-11T07:32:35-04:00'
summary: 'Worth keeping as a reference for actually tuning cache hit rates instead of guessing. Key things I''d forget otherwise: the lookback window is only 20 blocks, cache writes happen ONLY at the breakpoint, and a max_tokens:0 pre-warm kills first-token latency. Pricing: 5m writes 1.25x, 1h writes 2x, reads 0.1x base (0.05x on Opus 5.5 and 0.025x on Fable 5.1 as of September 2026). Also the table of what invalidates cache: tool defs invalidate everything; images/tool_choice only messages.'
tags: ['anthropic', 'claude-api', 'prompt-caching', 'llm-cost-optimization']
---
