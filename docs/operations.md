# Operations

Read [implementation status](implementation-status.md) before operating the
publisher. This extraction does not move the production channel or its secrets.

## Configuration and diagnostics

Copy `.env.example` to `.env` and set a dedicated Telegram token, the numeric
channel ID and working Solana RPC endpoints. The example pins
`FEED_PROFILE=github-first-claims` and disables performance follow-ups.
Optional GitHub and social credentials enrich cards. `DATA_DIR` holds history.

```bash
npm run doctor
npm run probe:endpoints
npm run audit:claims -- --hours 24
```

The doctor checks configuration, Telegram membership/post permissions and RPC
access. It does not send a test channel post. Its inherited identity guard
expects `github-first-claims` to target the production claims channel; an
alternate channel will be reported as a mismatch. Use unit tests for development.
The audit classifies PDA lifetime evidence and does not establish coin attribution.

`npm start` reads `.env` and starts the real publisher. Never run a second
publisher against the production channel while the existing service is active.
The historical profile name is retained for compatibility. Pair eligibility is
transaction-evidence based rather than controlled by the PDA lifetime gate.

## Container

```bash
docker build -t pumpfun-github-claims .
docker volume create pumpfun-github-claims-data
docker run --env-file .env -p 3000:3000 \
  -v pumpfun-github-claims-data:/app/data pumpfun-github-claims
```

The image runs as a non-root user. Keep the history volume across restarts.
Do not bake `.env`, credentials or production history into the image.
The HTTP service provides `/health`, `/stats`, `/events/recent` and
`/events/stream`; configure external access according to the deployment.

## Production migration

The existing claims service is documented upstream as `pumpfun-claims-bot`,
channel `-1003533969743`. Verify the live revision, bot identity and configuration
before a cutover. The unrelated graduation service is `pumpfun-channel-bot`.

Preserve history, provenance, pending deliveries, configuration and rollback
artifacts. Stop the old publisher
before starting the replacement and validate delivery with real events. Do not
send diagnostics or test posts to the public channel. Do not share a bot token
between independent polling processes.

A successful local build or GitHub CI run establishes code health, not the
identity of the deployed revision or the correctness of per-coin attribution.
