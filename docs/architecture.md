# GitHub Claims feed architecture

The product is [Pump.fun GitHub Claims](https://t.me/pumpfunclaims): first-time
reward claims for GitHub-linked coins, enriched with market data, developer
history and socials. Its dedicated home is
[nirholas/pumpfun-github-claims](https://github.com/nirholas/pumpfun-github-claims).

Read the [product contract](product.md) first. It defines one alert
per **numeric GitHub user ID and full mint address**. Previous claims on other
coins provide context and must not suppress a first claim on a new coin.
Repeated claims for the same pair stay out. A developer need not launch the coin
or put its CA in GitHub.

## Existing components

| Component | Responsibility |
| --- | --- |
| `src/claim-monitor.ts` | Fetch and decode successful PumpFees claims; extract GitHub identity, PDA, recipient and quote-aware payment fields |
| `claim-backstop.ts` | Recover claim candidates from verifier signature history alongside websocket detection |
| `social-fee-index.ts` | Map fee recipients to potentially multiple delegated token mints |
| `first-claim.ts` | Legacy PDA-level diagnostics; not used for pair eligibility |
| `claim-tracker.ts` | Local persisted observations, including GitHub-user/mint keys |
| `index.ts` | Classification, bounded enrichment and delivery orchestration |
| `pump-client.ts`, `github-client.ts`, `x-client.ts` | Market, repository, developer and social context |
| `formatters.ts` | Telegram cards |
| `channel-policy.ts`, `config.ts` | Feed isolation at configuration and send boundaries |
| `delivery.ts`, `delivery-outbox.ts`, `watchdog.ts` | Durable delivery, failure reporting and transport monitoring |
| `event-store.ts`, `health.ts`, `webhooks.ts` | Recent events, health, read-only API/SSE and optional webhook delivery |

## Runtime attribution flow

The runtime follows this flow:

```text
Successful GitHub claim transaction
    → payment evidence and stable GitHub identity
    → evidence-backed coin attribution (or unresolved record)
    → durable first-claim check for the developer–mint pair
    → bounded market/project/social enrichment and developer history
    → pending delivery → channel card → delivered state
```

A token delegated to a shared fee account is a candidate, not proof of a payment
from that coin. Do not mark all candidates claimed, or treat a new market-cap
leader as a newly claimed coin. Developer-wide lifetime status is separate
context. Partial history must remain explicit.

## Delivery and migration

Keep the existing claims and graduations services separate. The legacy
`github-first-claims` profile name remains for configuration compatibility.
Publishing the standalone source does not deploy it, change Telegram tokens,
transfer channel ownership or migrate historical records.

The implementation has durable pair-level history and a retryable outbox.
Preserve those records during cutover and run only one publisher. The existing
audit script classifies PDA-wide first claims; it cannot prove there were no
missed first claims on other coins.

## Verification

Run `npm run typecheck`, `npm test` and `npm run build` at the repository root for
local validation. The product contract lists the per-coin, history, replay and
delivery scenarios. Read [upstream decoder policy](https://github.com/nirholas/pump-fun-sdk/blob/main/DECODERS.md) before
changing binary event parsing; the standalone extraction records its source
revision and must document future decoder divergence.
