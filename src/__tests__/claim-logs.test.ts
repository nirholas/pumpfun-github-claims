/**
 * The WebSocket log filter decides which signatures are worth an RPC fetch, so a
 * claim it fails to recognize is a claim the feed never reports. This suite pins
 * both detection paths against the regression that motivated them: a filter
 * keyed only on ClaimSocialFeePda silently discarded every pure creator-fee
 * claim, which is most of the stream.
 */
import { describe, expect, it } from 'vitest';

import { hasClaimSignal } from '../claim-monitor.js';
import { CLAIM_INSTRUCTIONS } from '../types.js';

/** Build the "Program data:" line a claim event of this discriminator emits. */
function programData(discriminatorHex: string, payloadBytes = 64): string {
    const disc = Buffer.from(discriminatorHex, 'hex');
    const body = Buffer.alloc(payloadBytes);
    return `Program data: ${Buffer.concat([disc, body]).toString('base64')}`;
}

const NOISE = [
    'Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P invoke [1]',
    'Program log: Instruction: Buy',
    'Program consumption: 178234 units remaining',
];

describe('hasClaimSignal', () => {
    it('ignores unrelated traffic', () => {
        expect(hasClaimSignal(NOISE)).toBe(false);
        expect(hasClaimSignal([])).toBe(false);
    });

    it('detects a social fee claim, which emits no event at all', () => {
        // claim_social_fee_pda returns a struct rather than emitting a CPI event,
        // so the instruction log line is the only signal it leaves.
        expect(hasClaimSignal([...NOISE, 'Program log: Instruction: ClaimSocialFeePda'])).toBe(true);
    });

    it('detects a pure creator-fee claim from its event discriminator alone', () => {
        // The regression: this transaction carries no ClaimSocialFeePda log line.
        // A single-path filter dropped it, and it is the bulk of the claim stream.
        const collectCreatorFee = CLAIM_INSTRUCTIONS.find(
            (ix) => ix.claimType === 'collect_creator_fee',
        );
        expect(collectCreatorFee).toBeDefined();

        const logs = [...NOISE, programData(collectCreatorFee!.discriminator)];
        expect(logs.some((l) => l.includes('ClaimSocialFeePda'))).toBe(false);
        expect(hasClaimSignal(logs)).toBe(true);
    });

    it('detects every creator claim layout in the instruction table, V2 included', () => {
        const creatorClaims = CLAIM_INSTRUCTIONS.filter((ix) => ix.isCreatorClaim);
        expect(creatorClaims.length).toBeGreaterThan(0);

        for (const ix of creatorClaims) {
            expect(hasClaimSignal([programData(ix.discriminator)]), ix.label).toBe(true);
        }
    });

    it('does not fetch cashback, the highest-volume claim and not creator activity', () => {
        const cashback = CLAIM_INSTRUCTIONS.find((ix) => ix.claimType === 'claim_cashback');
        expect(cashback).toBeDefined();
        expect(hasClaimSignal([programData(cashback!.discriminator)])).toBe(false);
        expect(hasClaimSignal([...NOISE, 'Program log: Instruction: ClaimCashback'])).toBe(false);
    });

    it('survives malformed and truncated program data', () => {
        expect(hasClaimSignal(['Program data: '])).toBe(false);
        expect(hasClaimSignal(['Program data: !!!not-base64!!!'])).toBe(false);
        expect(hasClaimSignal(['Program data: AAAA'])).toBe(false);
    });
});
