/**
 * The WebSocket log filter decides which signatures are worth an RPC fetch, so a
 * claim it fails to recognize is a claim the feed never reports. This suite pins
 * both detection paths against the regression that motivated them: a filter
 * keyed only on ClaimSocialFeePda silently discarded every pure creator-fee
 * claim, which is most of the stream.
 */
import { describe, expect, it } from 'vitest';

import { hasClaimSignal } from '../claim-monitor.js';
import { CLAIM_EVENT_DISCRIMINATORS } from '../types.js';
import {
    collectCreatorFeeEvent,
    key,
    programData as eventLine,
    sweepBondingCurveFeeEvent,
    sweepPoolFeeEvent,
} from './pump-event-bytes.js';

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
        const logs = [...NOISE, eventLine(collectCreatorFeeEvent(key(3), 5_000_000_000n))];
        expect(logs.some((l) => l.includes('ClaimSocialFeePda'))).toBe(false);
        expect(hasClaimSignal(logs)).toBe(true);
    });

    it('detects a V2 creator-fee event, which carries a trailing quote mint', () => {
        const logs = [...NOISE, eventLine(collectCreatorFeeEvent(key(3), 5_000_000n, key(4)))];
        expect(hasClaimSignal(logs)).toBe(true);
    });

    it('detects every creator payout event, keyed by event discriminator', () => {
        const creatorEvents = Object.entries(CLAIM_EVENT_DISCRIMINATORS).filter(([, info]) => info.isCreatorClaim);
        expect(creatorEvents.length).toBeGreaterThan(0);

        for (const [disc, info] of creatorEvents) {
            expect(hasClaimSignal([programData(disc)]), info.label).toBe(true);
        }
    });

    it('does not fetch a sweep, which moves fees into the vault but pays nobody', () => {
        const logs = [
            ...NOISE,
            'Program log: Instruction: SweepCreatorFee',
            eventLine(sweepBondingCurveFeeEvent(key(1), key(10), 2_000_000_000n, 1)),
            eventLine(sweepPoolFeeEvent(key(1), key(10), 3_000_000_000n, 1)),
        ];
        expect(hasClaimSignal(logs)).toBe(false);
    });

    it('does not fetch cashback, the highest-volume claim and not creator activity', () => {
        expect(hasClaimSignal([programData('e2d6f62107f293e5')])).toBe(false);
        expect(hasClaimSignal([...NOISE, 'Program log: Instruction: ClaimCashback'])).toBe(false);
        expect(hasClaimSignal([...NOISE, 'Program log: Instruction: ClaimCashbackV2'])).toBe(false);
    });

    it('survives malformed and truncated program data', () => {
        expect(hasClaimSignal(['Program data: '])).toBe(false);
        expect(hasClaimSignal(['Program data: !!!not-base64!!!'])).toBe(false);
        expect(hasClaimSignal(['Program data: AAAA'])).toBe(false);
    });
});
