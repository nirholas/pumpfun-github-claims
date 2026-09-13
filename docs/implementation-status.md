# Implementation status

The [product contract](product.md) is the intended behavior. The initial source
extraction preserves the existing channel-bot runtime and its tests.

## Available now

- PumpFees claim decoding with GitHub numeric identity and quote-aware payments.
- Websocket monitoring plus a verifier-history backstop and RPC fallback.
- GitHub/repository, token-market and social enrichment.
- Telegram formatting, delivery checks, feed policy and operational diagnostics.
- Local history, recent-event API, SSE, optional webhooks and tests.

## Work required for the product contract

1. Establish reproducible coin attribution for shared GitHub fee withdrawals.
   Retain unresolved events. Do not substitute highest market cap or all linked
   coins for evidence. Capture real multi-coin transaction fixtures.
2. Separate developer-wide lifetime status from per-pair eligibility. Replace
   the early lifetime rejection only when reliable attribution is available.
3. Backfill verified GitHub-ID/mint history with explicit coverage, source
   transactions and slots. Do not treat an empty local store as proof of first.
4. Replace additive fee-index updates and preserve historical delegation state
   separately from current mappings.
5. Add durable pending deliveries and atomic duplicate prevention across retries,
   restarts and workers. Migrate history before a production cutover.
6. Update cards: first claim for this coin; developer-first-ever or previous
   coins as context; linked repository instead of “Repo Claimed”; explicit
   pooled-payment scope and incomplete history.
7. Correct token prices: account for base/quote decimals and quote currency,
   and source current AMM prices after graduation.

The existing `first-claim.test.ts` deliberately tests inherited behavior,
including a 1% lifetime tolerance and missing-counter fallback. Those passing
tests are not approval of that behavior as the new product contract. Add the
acceptance scenarios in [product.md](product.md) when replacing that path.

The lifetime audit script likewise audits PDA-level claims, not first claims
for each coin. No `FIRST` lines is not proof that the per-coin feed missed nothing.
