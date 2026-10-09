/**
 * PumpFun Channel Bot — Event Monitor
 *
 * Monitors the Pump program for on-chain events:
 *   - Token launches (CreateEvent, emitted by create and create_v2)
 *   - Graduation (CompleteEvent when the curve completes, which since synthetic
 *     migration happens inside the completing buy; CompletePumpAmmMigrationEvent
 *     when migrate later opens the PumpSwap pool)
 *   - Whale trades (TradeEvent above a SOL threshold, plus the PostCompleteBuyEvent
 *     pool part of a buy that completed the curve)
 *   - Fee distributions (DistributeCreatorFeesEvent)
 *
 * Events are decoded from "Program data:" log lines by src/pump-events.ts, which
 * tolerates both the older, shorter layouts and the October 2026 longer ones.
 * Two modes: WebSocket (real-time) or HTTP polling (fallback).
 */


import {
    Connection,
    LAMPORTS_PER_SOL,
    PublicKey,
    type Logs,
    type SignaturesForAddressOptions,
} from '@solana/web3.js';

import type { ChannelBotConfig } from './config.js';
import { log } from './logger.js';
import {
    buyerTradesFromPayloads,
    decodeCreateEvent,
    decodeCompleteEvent,
    decodeDistributeCreatorFeesEvent,
    decodeMigrationEvent,
    EVENT_DISCRIMINATORS,
    eventDiscriminator,
    isSolQuote,
    programDataPayloads,
    type BuyerTrade,
} from './pump-events.js';
import { RpcFallback } from './rpc-fallback.js';
import type {
    FeeDistributionEvent,
    GraduationEvent,
    TokenLaunchEvent,
    TradeAlertEvent,
} from './types.js';
import {
    DEFAULT_GRADUATION_SOL_THRESHOLD,
    PUMP_PROGRAM_ID,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

const MAX_WS_ERRORS = 5;
const DEFAULT_TOKEN_TOTAL_SUPPLY = 1_000_000_000_000_000;
const WS_HEARTBEAT_INTERVAL_MS = 60_000;
const WS_HEARTBEAT_TIMEOUT_MS = 90_000;
/** After this many consecutive silent WS periods, fall back to polling. */
const MAX_WS_STALLS = 3;
/** While polling as a fallback, retry the WebSocket this often. */
const WS_RETRY_INTERVAL_MS = 10 * 60_000;

// ============================================================================
// Event Monitor
// ============================================================================

export class EventMonitor {
    private rpc: RpcFallback;
    private wsConnection?: Connection;
    private config: ChannelBotConfig;
    private programPubkey: PublicKey;

    private onLaunch: (event: TokenLaunchEvent) => void;
    private onGraduation: (event: GraduationEvent) => void;
    private onWhale: (event: TradeAlertEvent) => void;
    private onFeeDistribution: (event: FeeDistributionEvent) => void;

    private pollTimer?: ReturnType<typeof setInterval>;
    private wsSubscriptionId?: number;
    private lastSignature: string | undefined;
    private processedSignatures = new Set<string>();
    private readonly MAX_PROCESSED_CACHE = 10_000;
    private wsErrorCount = 0;
    private stopped = false;
    private isRunning = false;
    private lastWsEventTime = 0;
    private wsHeartbeatTimer?: ReturnType<typeof setInterval>;
    private wsStallCount = 0;
    private wsRetryTimer?: ReturnType<typeof setInterval>;
    private readonly wsUrls: string[];
    private wsUrlIndex = 0;
    private pollingActive = false;
    private currentMode: 'websocket' | 'polling' | 'stopped' = 'stopped';

    /** Active transport: 'websocket', 'polling', or 'stopped'. */
    get mode(): string {
        return this.currentMode;
    }

    /** The WebSocket endpoint currently subscribed through, for /stats. */
    get activeWsUrl(): string | undefined {
        return this.currentMode === 'websocket' ? this.wsUrls[this.wsUrlIndex] : undefined;
    }

    constructor(
        config: ChannelBotConfig,
        onLaunch: (event: TokenLaunchEvent) => void,
        onGraduation: (event: GraduationEvent) => void,
        onWhale: (event: TradeAlertEvent) => void,
        onFeeDistribution: (event: FeeDistributionEvent) => void,
    ) {
        this.config = config;
        this.onLaunch = onLaunch;
        this.onGraduation = onGraduation;
        this.onWhale = onWhale;
        this.onFeeDistribution = onFeeDistribution;
        this.rpc = new RpcFallback(config.solanaRpcUrls, {
            commitment: 'confirmed',
        });
        if (config.solanaRpcUrls.length > 1) {
            log.info('Event monitor: %d RPC endpoints configured (fallback enabled)', config.solanaRpcUrls.length);
        }
        this.programPubkey = new PublicKey(PUMP_PROGRAM_ID);
        this.wsUrls = config.solanaWsUrls?.length
            ? config.solanaWsUrls
            : (config.solanaWsUrl ? [config.solanaWsUrl] : []);
        if (this.wsUrls.length > 1) {
            log.info('Event monitor: %d WebSocket endpoints configured (failover enabled)', this.wsUrls.length);
        }
    }

    async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        if (this.wsUrls.length > 0 && (process.env.SOLANA_WS_URL || process.env.SOLANA_WS_URLS)) {
            try {
                await this.startWebSocket();
                this.currentMode = 'websocket';
                log.info('Event monitor: WebSocket mode');
                return;
            } catch (err) {
                log.warn('Event monitor WS failed, falling back to polling:', err);
            }
        }

        this.startPolling();
        log.info('Event monitor: polling mode (every %ds)', this.config.pollIntervalSeconds);
    }

    stop(): void {
        this.stopped = true;
        this.isRunning = false;
        this.currentMode = 'stopped';
        this.pollingActive = false;
        if (this.wsRetryTimer) {
            clearInterval(this.wsRetryTimer);
            this.wsRetryTimer = undefined;
        }
        if (this.wsHeartbeatTimer) {
            clearInterval(this.wsHeartbeatTimer);
            this.wsHeartbeatTimer = undefined;
        }
        if (this.wsConnection && this.wsSubscriptionId !== undefined) {
            this.wsConnection.removeOnLogsListener(this.wsSubscriptionId).catch(() => {});
        }
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = undefined;
        }
    }

    // ── WebSocket ────────────────────────────────────────────────────

    private async startWebSocket(): Promise<void> {
        const wsUrl = this.wsUrls[this.wsUrlIndex];
        if (!wsUrl) throw new Error('no WebSocket endpoints configured');
        this.wsConnection = new Connection(this.rpc.currentUrl, {
            commitment: 'confirmed',
            wsEndpoint: wsUrl,
        });

        this.lastWsEventTime = Date.now();

        // Clearing first matters: every reconnect calls back into this method,
        // and a stacked interval fires overlapping reconnects forever.
        if (this.wsHeartbeatTimer) clearInterval(this.wsHeartbeatTimer);

        this.wsSubscriptionId = this.wsConnection.onLogs(
            this.programPubkey,
            async (logInfo: Logs) => {
                this.lastWsEventTime = Date.now();
                this.wsStallCount = 0;
                // WS delivered a live event — if we had fallen back to polling,
                // promote WS back to primary and stop the poll loop.
                if (this.pollingActive) {
                    log.info('Event monitor: WebSocket recovered — leaving polling mode');
                    this.stopPollingLoop();
                    this.currentMode = 'websocket';
                    if (this.wsRetryTimer) {
                        clearInterval(this.wsRetryTimer);
                        this.wsRetryTimer = undefined;
                    }
                }
                try { await this.handleLogEvent(logInfo); }
                catch (err) { log.error('Event log error:', err); }
            },
            'confirmed',
        );

        // Heartbeat: if no event received for too long, reconnect. The pump
        // program normally emits thousands of events per minute, so silence
        // reliably means the socket is dead even when the client library keeps
        // "reconnecting" underneath us (e.g. an endlessly-429ing endpoint).
        this.wsHeartbeatTimer = setInterval(() => {
            if (this.stopped || this.pollingActive) return;
            const elapsed = Date.now() - this.lastWsEventTime;
            if (elapsed > WS_HEARTBEAT_TIMEOUT_MS) {
                this.wsStallCount++;
                log.warn('Event monitor WS silent for %ds (stall %d/%d) — reconnecting...',
                    Math.floor(elapsed / 1000), this.wsStallCount, MAX_WS_STALLS);
                this.reconnectWebSocket();
            }
        }, WS_HEARTBEAT_INTERVAL_MS);
    }

    private reconnectWebSocket(): void {
        if (this.stopped) return;
        // Clean up old connection
        if (this.wsConnection && this.wsSubscriptionId !== undefined) {
            this.wsConnection.removeOnLogsListener(this.wsSubscriptionId).catch(() => {});
        }
        this.wsSubscriptionId = undefined;
        this.wsConnection = undefined;

        // Step to the next endpoint. Retrying the one that just went quiet is
        // how a feed ends up silent for days on an endpoint that started
        // refusing the upgrade (magicblock went key-gated on 2026-09-09).
        if (this.wsUrls.length > 1) {
            this.wsUrlIndex = (this.wsUrlIndex + 1) % this.wsUrls.length;
            log.info('Event monitor: switching to WebSocket endpoint %d/%d', this.wsUrlIndex + 1, this.wsUrls.length);
        }

        if (this.wsStallCount >= MAX_WS_STALLS) {
            this.fallBackToPolling();
            return;
        }

        // Attempt to reconnect
        this.startWebSocket().catch((err) => {
            log.warn('Event monitor WS reconnect failed: %s', err);
            this.fallBackToPolling();
        });
    }

    /** Switch to polling and keep retrying the WebSocket in the background. */
    private fallBackToPolling(): void {
        if (this.stopped || this.pollingActive) return;
        log.warn('Event monitor: WebSocket unusable — falling back to polling (every %ds), will retry WS every %dm',
            this.config.pollIntervalSeconds, WS_RETRY_INTERVAL_MS / 60_000);
        this.startPolling();
        if (!this.wsRetryTimer) {
            this.wsRetryTimer = setInterval(() => {
                if (this.stopped || !this.pollingActive) return;
                this.wsStallCount = 0;
                if (this.wsUrls.length > 1) {
                    this.wsUrlIndex = (this.wsUrlIndex + 1) % this.wsUrls.length;
                }
                log.info('Event monitor: retrying WebSocket (endpoint %d/%d)...',
                    this.wsUrlIndex + 1, this.wsUrls.length);
                this.startWebSocket().catch((err) => {
                    log.debug('WS retry failed: %s', err);
                });
            }, WS_RETRY_INTERVAL_MS);
        }
    }

    private async handleLogEvent(logInfo: Logs, blockTime?: number | null): Promise<void> {
        const { signature, logs: logLines, err } = logInfo;
        if (err) return;
        if (this.processedSignatures.has(signature)) return;
        this.processedSignatures.add(signature);
        this.trimCache();

        const payloads = programDataPayloads(logLines);
        for (const bytes of payloads) {
            try {
                const disc = eventDiscriminator(bytes);
                if (disc === EVENT_DISCRIMINATORS.CreateEvent) {
                    this.decodeLaunch(bytes, signature);
                } else if (disc === EVENT_DISCRIMINATORS.CompleteEvent || disc === EVENT_DISCRIMINATORS.CompletePumpAmmMigrationEvent) {
                    this.decodeGraduation(bytes, signature, blockTime);
                } else if (disc === EVENT_DISCRIMINATORS.DistributeCreatorFeesEvent) {
                    this.decodeFeeDistribution(bytes, signature);
                }
            } catch (err) {
                log.debug('Malformed log line in %s: %s', signature.slice(0, 8), err);
            }
        }

        // Trades are read as a whole: a completing buy's pool part arrives as a
        // separate PostCompleteBuyEvent after its TradeEvent and CompleteEvent.
        try {
            for (const alert of tradeAlertsFromPayloads(payloads, signature, this.config.whaleThresholdSol)) {
                this.onWhale(alert);
            }
        } catch (err) {
            log.debug('Trade decode error in %s: %s', signature.slice(0, 8), err);
        }
    }

    // ── Polling ──────────────────────────────────────────────────────

    private stopPollingLoop(): void {
        this.pollingActive = false;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = undefined;
        }
    }

    private startPolling(): void {
        if (this.pollingActive) return;
        this.pollingActive = true;
        this.currentMode = 'polling';
        const poll = async () => {
            if (this.stopped || !this.pollingActive) return;
            try {
                const opts: SignaturesForAddressOptions = { limit: 20 };
                if (this.lastSignature) opts.until = this.lastSignature;

                const sigs = await this.rpc.withFallback((conn) => conn.getSignaturesForAddress(this.programPubkey, opts));
                if (sigs.length > 0) this.lastSignature = sigs[0]!.signature;

                for (const sigInfo of sigs) {
                    if (sigInfo.err) continue;
                    if (this.processedSignatures.has(sigInfo.signature)) continue;
                    this.processedSignatures.add(sigInfo.signature);
                    await this.fetchAndProcessLogs(sigInfo.signature);
                }
                this.trimCache();
            } catch (err) {
                log.error('Event poll error:', err);
            }

            if (!this.stopped && this.pollingActive) {
                this.pollTimer = setTimeout(poll, this.config.pollIntervalSeconds * 1000);
            }
        };
        poll();
    }

    private async fetchAndProcessLogs(signature: string): Promise<void> {
        try {
            const tx = await this.rpc.withFallback((conn) => conn.getParsedTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0,
            }));
            if (!tx?.meta || tx.meta.err) return;

            const logMessages = tx.meta.logMessages ?? [];
            await this.handleLogEvent({
                signature,
                logs: logMessages,
                err: null,
            }, tx.blockTime);
        } catch (err) {
            log.debug('Failed to fetch tx %s: %s', signature.slice(0, 8), err);
        }
    }

    // ── Decoders ─────────────────────────────────────────────────────

    private decodeLaunch(bytes: Buffer, signature: string): void {
        const create = decodeCreateEvent(bytes);
        if (!create) return;
        const githubUrls = extractGithubUrlsFromString(create.name + ' ' + create.symbol + ' ' + create.uri);
        this.onLaunch({
            txSignature: signature,
            slot: 0,
            timestamp: create.timestamp,
            mintAddress: create.mint,
            creatorWallet: create.creator || create.user,
            name: create.name,
            symbol: create.symbol,
            description: '',
            metadataUri: create.uri,
            hasGithub: githubUrls.length > 0,
            githubUrls,
            mayhemMode: create.isMayhemMode ?? false,
            cashbackEnabled: create.isCashbackEnabled ?? false,
        });
    }

    private decodeGraduation(bytes: Buffer, signature: string, blockTime?: number | null): void {
        const fallbackTime = blockTime ?? Math.floor(Date.now() / 1000);
        const migration = decodeMigrationEvent(bytes);
        if (migration) {
            this.onGraduation({
                txSignature: signature,
                slot: 0,
                timestamp: migration.timestamp || fallbackTime,
                mintAddress: migration.mint,
                user: migration.user,
                bondingCurve: migration.bondingCurve,
                isMigration: true,
                solAmount: Number(migration.solAmount) / LAMPORTS_PER_SOL,
                mintAmount: Number(migration.mintAmount),
                poolMigrationFee: Number(migration.poolMigrationFee) / LAMPORTS_PER_SOL,
                poolAddress: migration.pool,
            });
            return;
        }
        const complete = decodeCompleteEvent(bytes);
        if (!complete) return;
        this.onGraduation({
            txSignature: signature,
            slot: 0,
            timestamp: complete.timestamp ?? fallbackTime,
            mintAddress: complete.mint,
            user: complete.user,
            bondingCurve: complete.bondingCurve,
            isMigration: false,
        });
    }

    private decodeFeeDistribution(bytes: Buffer, signature: string): void {
        const ev = decodeDistributeCreatorFeesEvent(bytes);
        if (!ev) return;
        this.onFeeDistribution({
            txSignature: signature,
            slot: 0,
            timestamp: ev.timestamp || Math.floor(Date.now() / 1000),
            mintAddress: ev.mint,
            bondingCurve: ev.bondingCurve,
            admin: ev.admin,
            distributedSol: isSolQuote(ev.quoteMint) ? Number(ev.distributed) / LAMPORTS_PER_SOL : 0,
            shareholders: ev.shareholders,
        });
    }

    private trimCache(): void {
        if (this.processedSignatures.size > this.MAX_PROCESSED_CACHE) {
            // Keep the most recent entries (Sets are insertion-ordered in JS)
            const arr = [...this.processedSignatures];
            this.processedSignatures = new Set(arr.slice(-5_000));
        }
    }
}

// ============================================================================
// Whale trades
// ============================================================================

/**
 * Whale alerts for one transaction. The buyer's total is the TradeEvent (curve
 * part) plus, when the buy completed the curve, its PostCompleteBuyEvent (pool
 * part). The SOL threshold applies to SOL-quoted coins only; trades on coins
 * quoted in another mint are not SOL whales and are skipped.
 */
export function tradeAlertsFromPayloads(
    payloads: readonly Buffer[],
    signature: string,
    whaleThresholdSol: number,
): TradeAlertEvent[] {
    const out: TradeAlertEvent[] = [];
    for (const buyer of buyerTradesFromPayloads(payloads)) {
        if (!isSolQuote(buyer.trade.quoteMint)) continue;
        const alert = toTradeAlert(buyer, signature);
        if (alert.solAmount >= whaleThresholdSol) out.push(alert);
    }
    return out;
}

/** Same as tradeAlertsFromPayloads, from raw log lines. */
export function tradeAlertsFromLogs(logs: readonly string[], signature: string, whaleThresholdSol: number): TradeAlertEvent[] {
    return tradeAlertsFromPayloads(programDataPayloads(logs), signature, whaleThresholdSol);
}

function toTradeAlert(buyer: BuyerTrade, signature: string): TradeAlertEvent {
    const { trade, postComplete } = buyer;
    const virtualSolReserves = Number(trade.virtualSolReserves);
    const virtualTokenReserves = Number(trade.virtualTokenReserves);
    const realSolReserves = Number(trade.realSolReserves);
    const marketCapSol = virtualTokenReserves > 0
        ? (virtualSolReserves * DEFAULT_TOKEN_TOTAL_SUPPLY) / (virtualTokenReserves * LAMPORTS_PER_SOL)
        : 0;
    const bondingCurveProgress = buyer.completedCurve
        ? 100
        : Math.min(100, (realSolReserves / LAMPORTS_PER_SOL) / DEFAULT_GRADUATION_SOL_THRESHOLD * 100);
    const fee = (trade.fee ?? 0n) + (postComplete?.fee ?? 0n);
    const creatorFee = (trade.creatorFee ?? 0n) + (postComplete?.creatorFee ?? 0n);

    const alert: TradeAlertEvent = {
        txSignature: signature,
        slot: 0,
        timestamp: trade.timestamp,
        mintAddress: trade.mint,
        user: trade.user,
        creator: trade.creator ?? '',
        isBuy: trade.isBuy,
        solAmount: Number(buyer.totalQuote) / LAMPORTS_PER_SOL,
        tokenAmount: Number(buyer.totalTokens),
        fee: Number(fee) / LAMPORTS_PER_SOL,
        creatorFee: Number(creatorFee) / LAMPORTS_PER_SOL,
        virtualSolReserves,
        virtualTokenReserves,
        realSolReserves,
        realTokenReserves: Number(trade.realTokenReserves),
        mayhemMode: trade.mayhemMode ?? false,
        marketCapSol,
        bondingCurveProgress,
        ixName: trade.ixName,
        completedCurve: buyer.completedCurve,
    };
    if (postComplete) {
        alert.curveSolAmount = Number(trade.solAmount) / LAMPORTS_PER_SOL;
        alert.postCompleteSolAmount = Number(postComplete.quoteIn) / LAMPORTS_PER_SOL;
        alert.postCompleteTokenAmount = Number(postComplete.baseOut);
    }
    return alert;
}

// ============================================================================
// Helpers
// ============================================================================

const GITHUB_RE = /https?:\/\/github\.com\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?/gi;

function extractGithubUrlsFromString(text: string): string[] {
    if (!text) return [];
    const matches = text.match(GITHUB_RE);
    if (!matches) return [];
    return [...new Set(matches)];
}
