---
title: "Gate your admin routes — then re-verify the token in your own code"
description: "Putting a login in front of an endpoint is one lock. Having the endpoint check the proof itself is the second. Defense in depth is cheap when you wire it once."
category: "tooling"
publishedAt: "2026-07-08T14:00:00-04:00"
tags: ["security", "cloudflare", "workers", "auth"]
---

When I put a private console on a public site — a place to publish posts, generate
things, touch the repo — I use **two independent locks**, not one.

**Lock one: the platform gate.** An identity-aware proxy (I use Cloudflare Access)
sits in front of `/admin` and `/api/admin/*` and refuses anyone who isn't me. If
that were the whole story, the endpoints behind it would trust that the request
already passed — which is fine right up until a routing change, a misconfigured
path, or a same-origin quirk lets something through.

**Lock two: the endpoint verifies the proof itself.** The proxy forwards a signed
token (a JWT). My Worker re-verifies that token — signature against the provider's
public keys, audience, expiry — **on every request**, and *fails closed*: no valid
token, no action, even if the gate somehow let the request reach the code.

```js
// Fail closed: any missing/invalid claim → 403, before anything happens.
const claims = await verifyAccessJwt(request, env); // checks sig, aud, exp
if (!claims) return new Response('Forbidden', { status: 403 });
```

The principle generalizes past auth:

- **Never trust that an upstream check ran.** Re-assert the invariant where the
  action actually happens. The proxy and the code failing independently is the
  whole point — one hole doesn't open the door.
- **Fail closed, not open.** If verification can't complete — keys unreachable,
  clock skew, a parse error — the answer is "no," not "probably fine."
- **Keep a firewall on the *content*, too.** For anything that writes to a public
  repo, I scan the payload against a denylist before it commits, and a build gate
  re-scans the shipped output. Auth decides *who*; the content firewall decides
  *what*. They're different questions — answer both.

None of this is expensive. It's a bit of wiring you do once and stop thinking
about — and it's the difference between one mistake being a near-miss and one
mistake being the incident.
