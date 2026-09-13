# Contributing

Read [product rules](docs/product.md), [implementation status](docs/implementation-status.md)
and [source provenance](docs/provenance.md). The source license is in [LICENSE](LICENSE).

Use Node.js 22+, run `npm ci`, make a focused change and run `npm run check`.
Tests and builds need no live Telegram credentials. Include regression evidence
for attribution, history or delivery changes; passing inherited tests alone does
not establish the per-coin contract. Label local observations and incomplete
historical data honestly.

Do not commit `.env`, credentials, production history or build output. Run local
checks without starting a publisher. A pull request should describe the trigger,
resulting behavior and validation; production deployment is a separate action.
