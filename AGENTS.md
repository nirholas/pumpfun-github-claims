# Pump.fun GitHub Claims — contributor guidance

Read [the product contract](docs/product.md) and
[implementation status](docs/implementation-status.md) before changing behavior.
One alert belongs to one numeric GitHub-ID/mint pair: first A alerts, repeat A
does not, first B by the same developer alerts with A in history. A CA in GitHub
and developer token creation are not prerequisites.

The current PDA lifetime gate and highest-market-cap mint selection are known
gaps. A shared withdrawal does not name a coin. Establish attribution rather
than marking every linked coin claimed or treating a ranking change as a claim.
Do not mislabel locally observed history as complete lifetime history.

Keep production identities, attribution evidence and persistent delivery/history
state explicit. No diagnostics or test messages belong in the public channel.
Source changes alone do not migrate or deploy the service.

Run `npm run check` for changes. For decoder work, read source provenance and
relevant upstream Pump protocol documentation, then add transaction fixtures.
Use `npm run typecheck`; never invoke `npx tsc --noEmit` directly.
