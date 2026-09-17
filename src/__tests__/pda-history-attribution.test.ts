import { describe, expect, it } from 'vitest';
import { evidenceFromPdaHistory, isSocialClaimLog, parseTransactionDistributions } from '../claim-monitor.js';

// Real distributions into mikeinspace's GitHub fee PDA before its 85.42 SOL
// withdrawal (4iBaBp…, 2026-09-17), which pump.fun's claim flow sent in
// separate transactions from the claim itself.
const PDA = '9BEVgdxQpDgjj3EgYRYeWYeicKf6iE7zTZ5CnA5paLZz';
const MEMPOOL_MOTH = '4xd5GwBhRrkHdf5o5M1rrHwboQCsf8yoLxGDPj1SRD6V';
const MOTH_85_SOL = 'Program data: pTeBcASzyigPeqtqAAAAADrSyz/eSK7QrJ7htu0LR/p7gpPwKqVA66ujzU/mt2y+d2KcWEMzRojeoQHGGU7rwNROefBhSCDRLe6ll8brvYAHUXusxw+Bk/A/Mz8IVCe6/0Fsp5lzMCs1NxXKs4F7iNPCp7ebrctSHNFbvvyfxXSI/nI0YxtCWWQzm99A66wEAQAAAHl8j9P4CB5JYA482xU/pZk9aymR7o5GrdLS2EbvP6B9ECf8xnHXEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const OTHER_COIN_0_076_SOL = 'Program data: pTeBcASzyigZeqtqAAAAADxTOuITpmyssG5YpXtnQRIcvQgtAGA9QdVomWZWfOOjfEZ3rKLxTbOlfU6kz0KmyZ4oS9XdFCBjquYtB2XGDBcmdavX+Uod4BDWKn72j6J119nACm9GRpRQ2EwSyRTQPb7ChX2EXAbtKHAMzzQzETtojkCczOFVi6RmfEtLFRhgAQAAAHl8j9P4CB5JYA482xU/pZk9aymR7o5GrdLS2EbvP6B9ECd0kYcEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const CLAIMED_RAW = 85_422_297_153n;

describe('PDA-history coin attribution', () => {
    const history = parseTransactionDistributions([MOTH_85_SOL, OTHER_COIN_0_076_SOL]);

    it('attributes a withdrawal to the coin that paid nearly all of it', () => {
        expect(evidenceFromPdaHistory(history, PDA, CLAIMED_RAW)).toEqual([expect.objectContaining({
            mint: MEMPOOL_MOTH, recipientAmountRaw: '85218936572', source: 'pda_history_distribution',
        })]);
    });

    it('refuses when observed history does not cover the withdrawal', () => {
        const withoutMain = parseTransactionDistributions([OTHER_COIN_0_076_SOL]);
        expect(evidenceFromPdaHistory(withoutMain, PDA, CLAIMED_RAW)).toEqual([]);
    });

    it('refuses when no single coin dominates the pooled withdrawal', () => {
        const [main] = history;
        const rival = { ...main!, mint: 'RivalMint1111111111111111111111111111111111' };
        expect(evidenceFromPdaHistory([main!, rival], PDA, CLAIMED_RAW * 2n)).toEqual([]);
    });

    it('ignores distributions in a different quote currency', () => {
        expect(evidenceFromPdaHistory(history, PDA, CLAIMED_RAW, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toEqual([]);
    });

    it('ignores distributions to a different PDA', () => {
        expect(evidenceFromPdaHistory(history, '7y1Js1JxDtHcsRUgtCdMyKRsMZBBvWW3hF4zdxVgRBvq', CLAIMED_RAW)).toEqual([]);
    });

    it('recognises the previous claim that ends the lookback', () => {
        expect(isSocialClaimLog(['Program log: Instruction: ClaimSocialFeePdaV2'])).toBe(true);
        expect(isSocialClaimLog(['Program log: Instruction: DistributeCreatorFees'])).toBe(false);
    });
});
