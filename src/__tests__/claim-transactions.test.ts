/**
 * Whole claim transactions through ClaimMonitor, built from IDL byte buffers.
 * Since the October 2026 upgrade a claim usually sweeps first (curve or pool to
 * creator vault) and then claims (vault to creator). Only the claim is a
 * payout, a sweep-only transaction posts nothing, and two claims in one
 * transaction each keep their own amount.
 */

import { PublicKey, type ParsedTransactionWithMeta } from '@solana/web3.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../logger.js', () => ({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ClaimMonitor } from '../claim-monitor.js';
import type { ChannelBotConfig } from '../config.js';
import { PUMP_AMM_PROGRAM_ID, PUMP_PROGRAM_ID, type FeeClaimEvent } from '../types.js';
import {
    collectCoinCreatorFeeEvent,
    collectCreatorFeeEvent,
    distributeCreatorFeesEvent,
    ixData,
    key,
    programData,
    sweepBondingCurveFeeEvent,
    sweepPoolFeeEvent,
    USDC,
} from './pump-event-bytes.js';

const CREATOR = key(3);
const VAULT = key(10);
const MINT = key(1);
const LAMPORTS = 1_000_000_000n;

const DISC = {
    sweepCreatorFee: '20f6bf3408c949ba',
    collectCreatorFee: '1416567bc61cdb84',
    collectCreatorFeeV2: 'cf118af204221338',
    collectCoinCreatorFee: 'a039592ab58b2b42',
    distributeV2: 'ffcb134ff444089f',
};

interface Ix {
    programId: string;
    disc: string;
    accounts?: string[];
    log: string;
    events: Buffer[];
}

function transaction(ixs: Ix[], balanceDelta = 0): ParsedTransactionWithMeta {
    const logs: string[] = [];
    for (const ix of ixs) {
        logs.push(`Program ${ix.programId} invoke [1]`, `Program log: Instruction: ${ix.log}`);
        logs.push(...ix.events.map(programData));
        logs.push(`Program ${ix.programId} success`);
    }
    return {
        slot: 400_000_000,
        blockTime: 1_790_000_000,
        transaction: {
            signatures: ['sig'],
            message: {
                accountKeys: [{ pubkey: new PublicKey(CREATOR), signer: true, writable: true, source: 'transaction' }],
                instructions: ixs.map((ix) => ({
                    programId: new PublicKey(ix.programId),
                    data: ixData(ix.disc),
                    accounts: (ix.accounts ?? []).map((a) => new PublicKey(a)),
                })),
                recentBlockhash: key(99),
            },
        },
        meta: {
            err: null,
            fee: 5_000,
            logMessages: logs,
            preBalances: [10_000_000_000],
            postBalances: [10_000_000_000 + balanceDelta],
            innerInstructions: [],
        },
    } as unknown as ParsedTransactionWithMeta;
}

async function claimsOf(tx: ParsedTransactionWithMeta): Promise<FeeClaimEvent[]> {
    const config = {
        solanaRpcUrls: ['http://127.0.0.1:8899'],
        solanaWsUrls: [],
        feed: { creatorClaims: true, feeDistributions: true },
    } as unknown as ChannelBotConfig;
    const events: FeeClaimEvent[] = [];
    const monitor = new ClaimMonitor(config, (event) => events.push(event));
    const internals = monitor as unknown as {
        rpc: { withFallback: (fn: (conn: unknown) => Promise<unknown>) => Promise<unknown> };
        processTransaction: (signature: string) => Promise<void>;
    };
    internals.rpc = {
        withFallback: (fn) => fn({
            getParsedTransaction: async () => tx,
            getSignaturesForAddress: async () => [],
        }),
    };
    await internals.processTransaction('sig');
    return events;
}

describe('claim transactions after the October 2026 upgrade', () => {
    it('reports the claim, not the sweep before it', async () => {
        const events = await claimsOf(transaction([
            { programId: PUMP_PROGRAM_ID, disc: DISC.sweepCreatorFee, log: 'SweepCreatorFee',
                events: [sweepBondingCurveFeeEvent(MINT, VAULT, 2n * LAMPORTS, 1)] },
            { programId: PUMP_PROGRAM_ID, disc: DISC.collectCreatorFeeV2, log: 'CollectCreatorFeeV2',
                accounts: [CREATOR, VAULT, key(11), key(12), key(0)],
                events: [collectCreatorFeeEvent(CREATOR, 5n * LAMPORTS, key(0))] },
        ], 5_000_000_000));
        expect(events).toHaveLength(1);
        expect(events[0]!.claimType).toBe('collect_creator_fee');
        expect(events[0]!.amountSol).toBe(5);
        expect(events[0]!.quoteTicker).toBe('SOL');
    });

    it('posts nothing for a sweep-only transaction', async () => {
        const events = await claimsOf(transaction([
            { programId: PUMP_PROGRAM_ID, disc: DISC.sweepCreatorFee, log: 'SweepCreatorFee',
                events: [sweepBondingCurveFeeEvent(MINT, VAULT, 2n * LAMPORTS, 1)] },
            { programId: PUMP_AMM_PROGRAM_ID, disc: DISC.sweepCreatorFee, log: 'SweepCreatorFee',
                events: [sweepPoolFeeEvent(MINT, VAULT, 3n * LAMPORTS, 1)] },
        ]));
        expect(events).toEqual([]);
    });

    it('keeps each claim amount when one transaction distributes and collects', async () => {
        const holders = [{ address: CREATOR, shareBps: 10_000 }];
        const events = await claimsOf(transaction([
            { programId: PUMP_PROGRAM_ID, disc: DISC.sweepCreatorFee, log: 'SweepCreatorFee',
                events: [sweepBondingCurveFeeEvent(MINT, VAULT, 3n * LAMPORTS, 1)] },
            { programId: PUMP_PROGRAM_ID, disc: DISC.distributeV2, log: 'DistributeCreatorFeesV2',
                accounts: [key(16), MINT],
                events: [distributeCreatorFeesEvent(MINT, 3n * LAMPORTS, holders, key(0))] },
            { programId: PUMP_PROGRAM_ID, disc: DISC.collectCreatorFee, log: 'CollectCreatorFee',
                events: [collectCreatorFeeEvent(CREATOR, LAMPORTS)] },
        ]));
        expect(events.map((e) => [e.claimType, e.amountSol, e.tokenMint])).toEqual([
            ['distribute_creator_fees', 3, MINT],
            ['collect_creator_fee', 1, ''],
        ]);
    });

    it('shows a PumpSwap creator fee paid in USDC in USDC, never as SOL', async () => {
        const events = await claimsOf(transaction([
            { programId: PUMP_AMM_PROGRAM_ID, disc: DISC.sweepCreatorFee, log: 'SweepCreatorFee',
                events: [sweepPoolFeeEvent(MINT, VAULT, 9_000_000n, 1)] },
            { programId: PUMP_AMM_PROGRAM_ID, disc: DISC.collectCoinCreatorFee, log: 'CollectCoinCreatorFee',
                accounts: [USDC, key(15)],
                events: [collectCoinCreatorFeeEvent(CREATOR, 9_000_000n)] },
        ]));
        expect(events).toHaveLength(1);
        expect(events[0]!.amountSol).toBe(0);
        expect(events[0]!.quoteTicker).toBe('USDC');
        expect(events[0]!.amountQuote).toBe(9);
    });
});
