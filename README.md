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

**The inherited runtime does not yet fully implement the per-coin rule above.**
It uses a shared-account lifetime gate and chooses a headline mint by market
cap. A shared GitHub fee-account withdrawal does not itself name a coin; reliable
coin attribution and historical per-pair tracking remain required work. See
[implementation status](docs/implementation-status.md) before running a feed.
The included tests validate the inherited behavior, not completion of that work.

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
