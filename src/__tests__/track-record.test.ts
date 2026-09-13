/**
 * Tests for the creator base-rate summary that replaces a bare launch count.
 */

import { describe, it, expect } from 'vitest';

import { summarizeCreatorTrackRecord } from '../formatters.js';
import type { CreatorProfile } from '../pump-client.js';

function creator(over: Partial<CreatorProfile>): CreatorProfile {
    return {
        wallet: 'CreatorSynthetic1111',
        username: 'dev',
        profileImage: '',
        followers: 0,
        totalLaunches: 0,
        scamEstimate: 0,
        recentCoins: [],
        ...over,
    };
}

function coin(mcap: number, complete = false) {
    return { name: 'n', symbol: 'S', mint: 'MintSynthetic1111', complete, usdMarketCap: mcap };
}

describe('summarizeCreatorTrackRecord', () => {
    it('says nothing for a first-time dev', () => {
        expect(summarizeCreatorTrackRecord(creator({ totalLaunches: 1, recentCoins: [coin(50_000)] }))).toBeNull();
    });

    it('says nothing when there is no profile or no history', () => {
        expect(summarizeCreatorTrackRecord(null)).toBeNull();
        expect(summarizeCreatorTrackRecord(undefined)).toBeNull();
        expect(summarizeCreatorTrackRecord(creator({ totalLaunches: 5, recentCoins: [] }))).toBeNull();
    });

    it('warns when most past launches died', () => {
        const result = summarizeCreatorTrackRecord(creator({
            totalLaunches: 5,
            recentCoins: [coin(100), coin(200), coin(50), coin(80_000, true), coin(10)],
        }));
        expect(result).toContain('⚠️');
        expect(result).toContain('5 launches');
        expect(result).toContain('1 graduated');
        expect(result).toContain('4 died under $5k');
    });

    it('does not warn when graduations outnumber dead coins', () => {
        const result = summarizeCreatorTrackRecord(creator({
            totalLaunches: 3,
            recentCoins: [coin(90_000, true), coin(120_000, true), coin(10)],
        }));
        expect(result).toContain('📈');
        expect(result).toContain('2 graduated');
    });

    it('flags when the sample is smaller than the true launch count', () => {
        const result = summarizeCreatorTrackRecord(creator({
            totalLaunches: 40,
            recentCoins: [coin(10), coin(20), coin(70_000, true)],
        }));
        expect(result).toContain('40 launches of last 3');
    });

    it('stays silent when every sampled coin is alive but not graduated', () => {
        expect(summarizeCreatorTrackRecord(creator({
            totalLaunches: 3,
            recentCoins: [coin(40_000), coin(60_000)],
        }))).toBeNull();
    });
});
