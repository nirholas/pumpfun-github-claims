# Source provenance

The initial extraction copies `channel-bot/src/`, its tests, `tsconfig.json`,
`vitest.config.ts`, and three diagnostics scripts from:

- Repository: https://github.com/nirholas/pump-fun-sdk
- Source commit: `85b10a2ac8e451bbaea7a2db36b6409ebfd1f3f5`
- Extracted September 13, 2026, at the owner's request.

Runtime behavior and inherited tests are retained in the initial extraction;
trailing whitespace and extra blank lines at EOF are normalized.
Package metadata, setup, environment example, Docker build, documentation and
CI are specific to this repository. The upstream license is preserved verbatim.
No credentials, deployed configuration or production claim history are copied.

The original channel-bot serves multiple feed profiles. This project documents
and configures the GitHub claims concept. Legacy modules remain for a tested
baseline; removing them is separate from getting coin attribution correct.

Upstream's [decoder policy](https://github.com/nirholas/pump-fun-sdk/blob/85b10a2ac8e451bbaea7a2db36b6409ebfd1f3f5/DECODERS.md)
identifies `pumpkit/packages/allclaims/src/claim-monitor.ts` as its canonical
copy. Future decoder changes here must document their source and regression
fixtures; do not silently assume either repository stays synchronized.

## Decoder divergence: Pump October 2026 upgrade

Source: the Pump, PumpSwap and PumpFees IDLs of the October 2026 upgrade, laid
out field by field. The same decoders ship in
[nirholas/pumpfun-claims-bot](https://github.com/nirholas/pumpfun-claims-bot)
(`src/pump-events.ts`, `src/claim-attribution.ts`); this repository carries
byte-identical copies.

- `src/pump-events.ts` decodes every event from its Anchor discriminator
  (`sha256("event:<Name>")[0..8]`) and is length tolerant: older, shorter
  events decode with the newer fields absent, and bytes a future version
  appends are ignored. It recognises the `buy_v3`, `sell_v3`,
  `buy_exact_quote_in_v3` and `multi_hop_swap` trade `ix_name` values.
- `src/claim-attribution.ts` pairs each claim instruction with the payout event
  logged inside that instruction, so two claims in one transaction never share
  or overwrite an amount. `sweep_creator_fee` and `sweep_protocol_fee` (Pump and
  PumpSwap) only move fees into the creator vault; they are never a claim and
  their sweep events are never counted as income, so a sweep-only transaction
  posts nothing.
- Claim tables gained `collect_creator_fee_v2`, `distribute_creator_fees_v2`,
  `transfer_creator_fees_to_pump_v2`, `claim_cashback_v2`,
  `claim_social_fee_pda_v2` and `update_fee_shares_v2`, each with its mint and
  quote-mint account positions. A quote mint carried by the event overrides the
  instruction account; the zero key or wrapped SOL means SOL.
- A buy that completes the curve under synthetic migration logs
  `PostCompleteBuyEvent` for the part bought after completion; whale totals add
  that amount to the trade.

Regression fixtures: `src/__tests__/pump-event-bytes.ts` builds old and new
event layouts from the IDLs, exercised by `pump-events.test.ts`,
`claim-attribution.test.ts`, `claim-logs.test.ts` and
`claim-transactions.test.ts` (whole transactions through `ClaimMonitor`).
