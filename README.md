# Pump.fun GitHub Claims 🛠️ 💊🟢

**First-time fee claims for GitHub-linked coins.** Price, market cap, developer
history, project activity, socials and more — a read-only Telegram feed.

[Follow @pumpfunclaims](https://t.me/pumpfunclaims) ·
[Product rules](docs/product.md) · [Architecture](docs/architecture.md) ·
[Implementation status](docs/implementation-status.md)

## The signal

Someone discovers a developer's project, launches a coin around it and delegates
trading-fee rewards to the developer's GitHub identity. When the developer
collects those rewards, traders get a new reason to investigate the project.
This feed is built to surface that moment quickly, with the context needed to
assess the developer and coin.

The developer need not launch the token or publish its CA in GitHub. A developer
may have many coins delegated to them and choose to support a particular one.
The claim and that ongoing choice are separate facts.

## How traders should read the labels

| Label | Meaning |
| --- | --- |
| **Transaction-Attributed GitHub Fee Claim** | This transaction names the coin and distributes its fees to the claimed GitHub fee account. |
| **Verified GitHub Fee Claim** | Claiming username exactly matches the repository owner in token metadata. |
| **Creator-Wallet GitHub Fee Claim** | Recipient wallet also created the token; repository ownership is not established. |
| **Identity Mismatch** | Claiming username differs from the metadata repository owner; a lookalike is possible. |
| **Unverified** | The withdrawal is real, but the GitHub-to-coin relationship is not proven. |
| **Unresolved** | The withdrawal lacks same-transaction coin-distribution evidence and is not published as a trading alert. |

“First” means the first developer–coin pair within the persisted history coverage.
Trade buttons are limited to verified relationships. Every card is a research
lead, not an endorsement.

## One alert per developer and coin

| Claim | Notify? |
| --- | --- |
| Developer first claims coin A | Yes |
| Developer claims A again | No |
| Same developer first claims coin B | Yes, with previous claimed coins as context |
| Another token has the same name but a different CA | It is a different coin |

The key is the **numeric GitHub user ID + full mint address**. A developer's
first-ever GitHub claim is additional context, not a gate that excludes their
first claim on a different coin. Mere delegation does not trigger an alert.

The [product contract](docs/product.md) explains this using the owner's
three.ws / THREE example and sets out attribution, history and delivery rules.

## Project status

This is the standalone home for the concept, extracted from
[nirholas/pump-fun-sdk](https://github.com/nirholas/pump-fun-sdk). It includes the
existing TypeScript monitor, enrichment clients, Telegram delivery, diagnostics
and tests. The source can build and run independently of the general SDK.

The runtime implements the per-coin rule with same-transaction
`DistributeCreatorFeesEvent` evidence. It never selects a mint by market cap or
by a historical shared-PDA candidate list. Unattributed withdrawals remain in
the event/API stream without producing a channel card. See the
[2026-09-15 repair audit](docs/audit-2026-09-15.md) for evidence and limitations.

This repository's creation does not change the live channel deployment.

## Local development

Requires Node.js 22 or newer.

```bash
npm ci
npm run check
```

`check` runs typechecking, tests and a build. No wallet, Telegram credentials or
live channel access is required for these checks.

To operate a configured instance:

```bash
cp .env.example .env
# Set your bot token, numeric channel ID and RPC endpoints in .env.
npm run build
npm start
```

`npm start` is the real publisher and can send alerts to the configured channel.
For diagnostics, persistence and migration, read [operations](docs/operations.md).
The example selects the GitHub claims profile; other feed paths remain in the
inherited source for compatibility but are disabled by that profile.

## Community

**PumpFun Tracker [Github Claims] 🛠️ 💊🟢 — Pump.fun GitHub Claims**

- Feed: [t.me/pumpfunclaims](https://t.me/pumpfunclaims)
- Suggestions: DM [@nichxbt](https://t.me/nichxbt)
- Related bots: [@pfclaimsbot](https://t.me/pfclaimsbot), [@cryptocurrencyvisionbot](https://t.me/cryptocurrencyvisionbot)
- Graduation channel: [@migratedpumpfun](https://t.me/migratedpumpfun)

More channels coming soon. These are community links; verify the actual posting
bot through the deployment configuration.

## Source and license

See [provenance](docs/provenance.md) for the extraction revision and boundaries.
Copyright 2026 nirholas. The upstream [license](LICENSE) is preserved; this
public repository does not grant an open-source license.
