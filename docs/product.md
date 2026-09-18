# Pump.fun GitHub Claims

**First-time fee claims for GitHub-linked coins.** A read-only feed that helps
traders discover when a developer starts collecting trading-fee rewards, with
price, market cap, developer history, project information and socials.

- Channel: [PumpFun Tracker [Github Claims] 🛠️ 💊🟢](https://t.me/pumpfunclaims)
- Dedicated repository: [nirholas/pumpfun-github-claims](https://github.com/nirholas/pumpfun-github-claims)
- Suggestions: [@nichxbt](https://t.me/nichxbt)
- Related bots: [@pfclaimsbot](https://t.me/pfclaimsbot), [@cryptocurrencyvisionbot](https://t.me/cryptocurrencyvisionbot)
- Related graduation channel: [@migratedpumpfun](https://t.me/migratedpumpfun)

These are public community links. They do not identify the bot token or service
currently delivering a particular feed. More channels are planned.

## Why the feed exists

Someone can discover a developer's project, launch a Pump.fun coin around it,
and delegate trading-fee rewards to the developer's GitHub identity. The
developer can then collect those rewards. The developer need not have launched
the token, and its contract address (CA) need not appear in the GitHub repository.

The claim is the signal: the developer showed up to collect. Delivering that
event promptly lets traders investigate the project and developer before the
claim becomes widely noticed. Repository activity, reputation, account age,
socials and previous claimed coins give context. A claim does not settle which
coin the developer will continue supporting; that is a separate, ongoing choice.

## The notification rule

**Notify once for each GitHub fee account, on its first-ever withdrawal.**
Keyed by stable numeric GitHub user ID. Symbols, usernames and repository names
are not keys.

| Event | Channel behavior |
| --- | --- |
| A GitHub account withdraws delegated fees for the first time ever | Notify, naming the coin the withdrawal is attributed to |
| The same account withdraws again, on the same coin or any other | Suppress |
| One first-ever withdrawal pays several coins | Notify once |
| A service account that collects fees for many coins claims a new coin | Suppress: it has withdrawn before |
| A token merely delegates fees to the developer | No claim notification |
| An instruction fails or pays no rewards | No claim notification |
| A pooled first-ever withdrawal cannot be attributed to a coin | Retain the unresolved event; do not invent a coin |

"First-ever" is read from the chain, not from local history. Every
`SocialFeePdaClaimed` event carries the fee account's lifetime totals, which
already include the claim itself. The claim is first-ever only when the total
for its own currency equals the claim amount and the other currency's total is
empty. Because the proof is on-chain, a restart or a lost history volume cannot
turn a repeat claimer into a "first" one.

## Example: three.ws and THREE

As described by the project owner, @nichxbt announced development of
`nirholas/three.ws` on X. Someone else launched THREE at
`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump` and delegated rewards to the
developer. The developer collected rewards and chose to support that coin as
the main coin for three.ws, despite having more than 50 coins linked to their
GitHub identity.

The developer's first-ever withdrawal from that GitHub fee account should
trigger one alert, naming THREE when the withdrawal is attributed to it. No later
withdrawal should alert, whether it is for THREE, a pumpfun-sdk coin or another
THREE with a different CA: the account has withdrawn before, and the chain says
so. This is a product example supplied by the owner, not an independently
reconstructed transaction history or an exclusive commitment.

## What must be established

Keep four facts separate in storage and presentation:

1. **Delegation:** a token's fee configuration names a GitHub social-fee account
   as a recipient. This establishes a fee link, not a claim.
2. **Payment:** a successful claim identifies the GitHub numeric ID, fee PDA,
   receiving wallet, amount, quote asset and transaction.
3. **Coin attribution:** evidence connects the payment to a particular mint.
   A social-fee withdrawal can pool rewards from several coins; the withdrawal
   event alone has no repository or token-mint field.
4. **Developer support:** statements or actions identify a coin the developer
   chooses to support. Fee delegation and metadata alone do not establish that.

Never derive coin attribution from the highest market cap, a token name, a
GitHub URL, or the mere presence of a coin in a fee PDA's linked-token list.
Do not issue an alert for every linked coin when one pooled withdrawal occurs.
A later change in the list or ranking must not create a fictitious new claim.
Persist the attribution evidence and its transaction/slot provenance so a
reviewer can reproduce the decision. If sufficient evidence is unavailable,
keep the attribution unresolved until it can be established.

PDA lifetime counters describe the shared account's claim history. They can
help describe developer history, but cannot establish a first claim for a
particular coin or veto an experienced developer's new-coin claim.

## What a card should show

### Trader-facing evidence labels

Use **Transaction-Attributed GitHub Fee Claim**, **Verified GitHub Fee Claim**,
**Creator-Wallet GitHub Fee Claim**, **Identity Mismatch**, **Unverified**, or
**Unresolved**. Only transaction-attributed or otherwise verified statuses may
show trade links. These labels describe evidence, not endorsement or future support.

- The full CA, name, symbol and first-claim status for the GitHub fee account.
- Claim transaction, timestamp, recipient, amount and correctly identified
  quote currency. A pooled withdrawal total must be labeled as such.
- GitHub identity, account age, project/repository information, activity and
  socials. Use **“Linked repository”** for a repository obtained from metadata.
- Previously claimed coins, with full links and a clear history coverage limit.
- Price, market cap, graduation status, liquidity and timestamps where available.
- Context such as a GitHub-owner mismatch, a new account, or same-name tokens.
  These observations provide context; they are not proof of impersonation or
  developer endorsement. Organization repositories may have individual claimers.

Missing enrichment must not erase a verified claim. Perform slow API enrichment
with bounded concurrency and deadlines. Keep discovery and delivery state
separate, persist pending deliveries, and retry the same event on send failure.
Replays, restarts and concurrent workers must not create duplicate pair alerts.

## Implementation status — September 15, 2026

This document is the product contract. The repaired `src/` implementation now
enforces the core per-coin rule:

| Requirement | Current behavior |
| --- | --- |
| Pair attribution | Same-transaction distribution must name the mint and claimed PDA |
| Pair eligibility | Numeric GitHub ID plus full mint; PDA lifetime does not veto a new coin |
| History | Atomic persistent pair ledger with explicit coverage language |
| Pricing | Decimal-normalized reserves and current graduated-token market data |
| Fee index | Current mappings replace superseded shareholders |
| Delivery | Durable at-least-once outbox; Telegram has no send idempotency key |

Historical backfill and production-volume migration remain operator tasks; an
empty local ledger is never described as complete lifetime history.

## Acceptance scenarios for the implementation

Before deploying the per-coin behavior, verify first A → notify, repeat A →
suppress, first B by the same developer → notify with A in history; also test
same-name/different-CA coins, another developer on A, wallet/username/currency
changes, unresolved pooled withdrawals, stale delegation mappings, missing
historical coverage, duplicate log delivery, concurrent workers, restart and
failed Telegram delivery. Include a real attributed multi-coin claim fixture;
a synthetic mint chosen by market cap cannot prove this requirement.
