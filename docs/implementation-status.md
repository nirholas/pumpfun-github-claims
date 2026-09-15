# Implementation status

The [product contract](product.md) is the intended behavior. The initial source
extraction preserves the existing channel-bot runtime and its tests.

## Available now

- PumpFees claim decoding with GitHub numeric identity and quote-aware payments.
- Websocket monitoring plus a verifier-history backstop and RPC fallback.
- GitHub/repository, token-market and social enrichment.
- Telegram formatting, delivery checks, feed policy and operational diagnostics.
- Evidence labels for transaction attribution, repository/creator verification,
  mismatch and unresolved cases; unresolved events select no CA.
- Local history, recent-event API, SSE, optional webhooks and tests.
- Same-transaction distribution decoding, current fee-share mappings, normalized
  prices, atomic pair ledgers and a durable delivery outbox.

## Remaining production work

1. Backfill verified GitHub-ID/mint history with explicit coverage, source
   transactions and slots. Do not treat an empty local store as proof of first.
2. Preserve historical delegation state
   separately from current mappings.
3. Persist card evidence provenance beyond the bounded in-memory stream for downstream
   consumers; keep developer-first-ever and per-coin history separate.
4. Reconcile Telegram's narrow acknowledgement crash window if an external
   channel-history source becomes available; Bot API sends have no idempotency key.

The inherited `first-claim.test.ts` covers PDA-level diagnostic behavior, but
that helper no longer gates evidenced developer–coin alerts.

The lifetime audit script likewise audits PDA-level claims, not first claims
for each coin. No `FIRST` lines is not proof that the per-coin feed missed nothing.
