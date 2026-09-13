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
