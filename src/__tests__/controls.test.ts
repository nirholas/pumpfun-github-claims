/**
 * Tests for the runtime-control surface: event store, webhook delivery,
 * admin helpers, and the new config knobs.
 */

import { createServer, type Server } from 'node:http';
import { describe, it, expect, afterEach } from 'vitest';

import { EventStore } from '../event-store.js';
import { WebhookDispatcher, signBody } from '../webhooks.js';
import { isMuted, type RuntimeState } from '../admin.js';

// ── Event Store ────────────────────────────────────────────────────────────

describe('EventStore', () => {
    it('records events with increasing sequence numbers and counters', () => {
        const store = new EventStore();
        const a = store.record({ kind: 'launch', summary: 'a', posted: false, data: {} });
        const b = store.record({ kind: 'graduation', summary: 'b', posted: false, data: {} });
        expect(a.seq).toBe(1);
        expect(b.seq).toBe(2);
        expect(store.total).toBe(2);
        expect(store.counters.launch).toBe(1);
        expect(store.counters.graduation).toBe(1);
    });

    it('returns recent events newest-first with kind filtering', () => {
        const store = new EventStore();
        store.record({ kind: 'launch', summary: 'l1', posted: false, data: {} });
        store.record({ kind: 'whale', summary: 'w1', posted: false, data: {} });
        store.record({ kind: 'launch', summary: 'l2', posted: false, data: {} });
        const recent = store.recent(10);
        expect(recent[0]!.summary).toBe('l2');
        const launches = store.recent(10, 'launch');
        expect(launches.map((e) => e.summary)).toEqual(['l2', 'l1']);
    });

    it('evicts oldest events beyond capacity', () => {
        const store = new EventStore(3);
        for (let i = 1; i <= 5; i++) {
            store.record({ kind: 'launch', summary: `e${i}`, posted: false, data: {} });
        }
        const all = store.recent(10);
        expect(all).toHaveLength(3);
        expect(all.map((e) => e.summary)).toEqual(['e5', 'e4', 'e3']);
        expect(store.total).toBe(5);
    });

    it('marks events as posted', () => {
        const store = new EventStore();
        const e = store.record({ kind: 'whale', summary: 'w', posted: false, data: {} });
        store.markPosted(e.seq);
        expect(store.recent(1)[0]!.posted).toBe(true);
    });

    it('notifies subscribers and survives a throwing subscriber', () => {
        const store = new EventStore();
        const seen: number[] = [];
        store.subscribe(() => { throw new Error('broken subscriber'); });
        const unsub = store.subscribe((e) => seen.push(e.seq));
        store.record({ kind: 'claim', summary: 'c', posted: false, data: {} });
        expect(seen).toEqual([1]);
        unsub();
        store.record({ kind: 'claim', summary: 'c2', posted: false, data: {} });
        expect(seen).toEqual([1]);
    });
});

// ── Webhooks ───────────────────────────────────────────────────────────────

describe('WebhookDispatcher', () => {
    let server: Server | null = null;

    afterEach(() => {
        server?.close();
        server = null;
    });

    function listen(handler: Parameters<typeof createServer>[1]): Promise<number> {
        return new Promise((resolve) => {
            server = createServer(handler);
            server.listen(0, () => {
                const address = server!.address();
                resolve(typeof address === 'object' && address ? address.port : 0);
            });
        });
    }

    it('delivers a signed JSON POST', async () => {
        const received: Array<{ body: string; sig?: string; kind?: string }> = [];
        const port = await listen((req, res) => {
            let body = '';
            req.on('data', (c) => { body += c; });
            req.on('end', () => {
                received.push({
                    body,
                    sig: req.headers['x-pumpfeed-signature-256'] as string | undefined,
                    kind: req.headers['x-pumpfeed-event'] as string | undefined,
                });
                res.writeHead(200);
                res.end();
            });
        });

        const dispatcher = new WebhookDispatcher({ urls: [`http://127.0.0.1:${port}/hook`], secret: 'test-secret' });
        const store = new EventStore();
        const event = store.record({ kind: 'graduation', mint: 'MintSynthetic1111', summary: 'test grad', posted: false, data: { x: 1 } });
        await dispatcher.dispatch(event);

        expect(received).toHaveLength(1);
        expect(received[0]!.kind).toBe('graduation');
        expect(JSON.parse(received[0]!.body).mint).toBe('MintSynthetic1111');
        expect(received[0]!.sig).toBe(signBody('test-secret', received[0]!.body));
        expect(dispatcher.stats.delivered).toBe(1);
        expect(dispatcher.stats.failed).toBe(0);
    });

    it('does not retry on 4xx and records the failure', async () => {
        let hits = 0;
        const port = await listen((_req, res) => {
            hits++;
            res.writeHead(400);
            res.end();
        });

        const dispatcher = new WebhookDispatcher({ urls: [`http://127.0.0.1:${port}/hook`] });
        const store = new EventStore();
        await dispatcher.dispatch(store.record({ kind: 'launch', summary: 'x', posted: false, data: {} }));

        expect(hits).toBe(1);
        expect(dispatcher.stats.failed).toBe(1);
    });

    it('is a no-op with no URLs configured', async () => {
        const dispatcher = new WebhookDispatcher({ urls: [] });
        expect(dispatcher.enabled).toBe(false);
        const store = new EventStore();
        await dispatcher.dispatch(store.record({ kind: 'whale', summary: 'w', posted: false, data: {} }));
        expect(dispatcher.stats.delivered).toBe(0);
    });
});

// ── Admin helpers ──────────────────────────────────────────────────────────

describe('isMuted', () => {
    const base: Omit<RuntimeState, 'muteUntil'> = { posted: 0, getMode: () => 'test' };

    it('is false when muteUntil is unset or in the past', () => {
        expect(isMuted({ ...base, muteUntil: 0 })).toBe(false);
        expect(isMuted({ ...base, muteUntil: Date.now() - 1000 })).toBe(false);
    });

    it('is true while muteUntil is in the future', () => {
        expect(isMuted({ ...base, muteUntil: Date.now() + 60_000 })).toBe(true);
    });
});

// ── Config knobs ───────────────────────────────────────────────────────────

describe('config: admin and webhook parsing', () => {
    it('parses ADMIN_USER_IDS and WEBHOOK_URLS, dropping malformed entries', async () => {
        const prev = { ...process.env };
        process.env.TELEGRAM_BOT_TOKEN = '1:test';
        process.env.CHANNEL_ID = '@test_channel';
        process.env.ADMIN_USER_IDS = ' 123 , abc, -5, 456 ';
        process.env.WEBHOOK_URLS = 'https://a.example/hook, not-a-url ,https://b.example/hook';
        process.env.WEBHOOK_SECRET = 's3cret';
        try {
            const { loadConfig } = await import('../config.js');
            const config = loadConfig();
            expect(config.adminUserIds).toEqual([123, 456]);
            expect(config.webhookUrls).toEqual(['https://a.example/hook', 'https://b.example/hook']);
            expect(config.webhookSecret).toBe('s3cret');
        } finally {
            process.env = prev;
        }
    });
});
