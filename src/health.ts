/**
 * PumpFun Channel Bot — HTTP API
 *
 * Read-only JSON API alongside the Telegram feed, served from one port:
 *
 *   GET /health           — liveness for Railway / Cloud Run / Docker probes
 *   GET /stats            — counters, transport mode, feed toggles, uptime
 *   GET /events/recent    — ring buffer of recent events (?limit=50&kind=graduation)
 *   GET /events/stream    — live Server-Sent Events stream (?kind= filter)
 *
 * CORS is open: everything served here is public on-chain data.
 */

import { createServer, type Server, type ServerResponse } from 'node:http';

import { log } from './logger.js';
import type { EventStore, FeedKind, StoredEvent } from './event-store.js';

const DEFAULT_PORT = 3000;
const SSE_HEARTBEAT_MS = 25_000;

const FEED_KINDS: FeedKind[] = ['claim', 'launch', 'graduation', 'whale', 'feeDistribution'];

export interface HealthStats {
    /** Unix ms when the bot started */
    startedAt: number;
    /** Callback to get dynamic stats */
    getStats?: () => Record<string, unknown>;
    /** Event store backing /events endpoints (optional for bare health mode) */
    store?: EventStore;
}

let server: Server | null = null;
const sseClients = new Set<ServerResponse>();

function sendJson(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(body));
}

export function startHealthServer(opts: HealthStats): void {
    const port = Number(process.env.PORT || process.env.HEALTH_PORT || DEFAULT_PORT);

    let unsubscribe: (() => void) | undefined;
    if (opts.store) {
        unsubscribe = opts.store.subscribe((event: StoredEvent) => {
            const frame = `event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;
            for (const client of sseClients) {
                const wanted = (client as ServerResponse & { kindFilter?: FeedKind }).kindFilter;
                if (wanted && wanted !== event.kind) continue;
                client.write(frame);
            }
        });
    }

    server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const path = url.pathname.replace(/\/+$/, '') || '/';

        if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'method not allowed' });
            return;
        }

        if (path === '/health' || path === '/') {
            const uptimeMs = Date.now() - opts.startedAt;
            const dynamicStats = opts.getStats?.() ?? {};
            const status = dynamicStats.degraded ? 'degraded' : 'ok';
            sendJson(res, status === 'ok' ? 200 : 503, {
                status,
                uptime: `${Math.floor(uptimeMs / 1000)}s`,
                uptimeMs,
                ...dynamicStats,
            });
            return;
        }

        if (path === '/stats') {
            sendJson(res, 200, {
                uptimeMs: Date.now() - opts.startedAt,
                totalEvents: opts.store?.total ?? 0,
                counters: opts.store?.counters ?? {},
                sseClients: sseClients.size,
                ...(opts.getStats?.() ?? {}),
            });
            return;
        }

        if (path === '/events/recent') {
            if (!opts.store) {
                sendJson(res, 404, { error: 'event store not enabled' });
                return;
            }
            const limit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50;
            const kindParam = url.searchParams.get('kind') ?? undefined;
            if (kindParam && !FEED_KINDS.includes(kindParam as FeedKind)) {
                sendJson(res, 400, { error: `kind must be one of: ${FEED_KINDS.join(', ')}` });
                return;
            }
            sendJson(res, 200, { events: opts.store.recent(limit, kindParam as FeedKind | undefined) });
            return;
        }

        if (path === '/events/stream') {
            if (!opts.store) {
                sendJson(res, 404, { error: 'event store not enabled' });
                return;
            }
            const kindParam = url.searchParams.get('kind') ?? undefined;
            if (kindParam && !FEED_KINDS.includes(kindParam as FeedKind)) {
                sendJson(res, 400, { error: `kind must be one of: ${FEED_KINDS.join(', ')}` });
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
                'Access-Control-Allow-Origin': '*',
            });
            res.write(': connected\n\n');
            if (kindParam) {
                (res as ServerResponse & { kindFilter?: FeedKind }).kindFilter = kindParam as FeedKind;
            }
            sseClients.add(res);
            const heartbeat = setInterval(() => {
                res.write(': ping\n\n');
            }, SSE_HEARTBEAT_MS);
            req.on('close', () => {
                clearInterval(heartbeat);
                sseClients.delete(res);
            });
            return;
        }

        sendJson(res, 404, { error: 'not found' });
    });

    server.on('close', () => unsubscribe?.());

    server.listen(port, () => {
        log.info('HTTP API listening on port %d (/health, /stats, /events/recent, /events/stream)', port);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
            // Under an orchestrator (Cloud Run, Railway, Docker) a bound port
            // means another instance already owns this bot. Running on with a
            // dead API would fail every health probe with no explanation, and
            // two instances would double-post to the channel. Exit and let the
            // supervisor restart us cleanly.
            log.error('Port %d is already in use — another instance is running. Exiting.', port);
            process.exit(1);
        }
        log.warn('HTTP API error: %s', err);
    });
}

export function stopHealthServer(): void {
    for (const client of sseClients) client.end();
    sseClients.clear();
    server?.close();
    server = null;
}
