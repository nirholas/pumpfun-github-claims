/**
 * PumpFun Channel Bot — Webhook Delivery
 *
 * Fans every feed event out to subscriber URLs as signed JSON POSTs, so other
 * services (trading bots, dashboards, alert routers) can consume the feed
 * without scraping Telegram.
 *
 * Configure with:
 *   WEBHOOK_URLS=https://a.example/hook,https://b.example/hook
 *   WEBHOOK_SECRET=any-string        (optional; enables HMAC signing)
 *
 * Each delivery is a POST with:
 *   Content-Type: application/json
 *   X-PumpFeed-Event: <kind>
 *   X-PumpFeed-Signature-256: sha256=<hex hmac of the raw body>   (when secret set)
 */

import { createHmac } from 'node:crypto';

import { log } from './logger.js';
import type { StoredEvent } from './event-store.js';

const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

export interface WebhookConfig {
    urls: string[];
    secret?: string;
}

export interface WebhookStats {
    delivered: number;
    failed: number;
}

export class WebhookDispatcher {
    private config: WebhookConfig;
    readonly stats: WebhookStats = { delivered: 0, failed: 0 };

    constructor(config: WebhookConfig) {
        this.config = config;
        if (config.urls.length > 0) {
            log.info('Webhook delivery enabled → %d endpoint(s)%s',
                config.urls.length, config.secret ? ' (signed)' : '');
        }
    }

    get enabled(): boolean {
        return this.config.urls.length > 0;
    }

    /** Deliver an event to every configured URL. Never throws. */
    async dispatch(event: StoredEvent): Promise<void> {
        if (!this.enabled) return;
        const body = JSON.stringify(event);
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-PumpFeed-Event': event.kind,
        };
        if (this.config.secret) {
            const sig = createHmac('sha256', this.config.secret).update(body).digest('hex');
            headers['X-PumpFeed-Signature-256'] = `sha256=${sig}`;
        }
        await Promise.all(this.config.urls.map((url) => this.deliver(url, body, headers)));
    }

    private async deliver(url: string, body: string, headers: Record<string, string>): Promise<void> {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers,
                    body,
                    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
                });
                if (res.ok) {
                    this.stats.delivered++;
                    return;
                }
                // 4xx will not improve on retry; 5xx might
                if (res.status < 500) break;
            } catch {
                // network error / timeout — retry below
            }
            if (attempt < MAX_ATTEMPTS) {
                await new Promise((r) => setTimeout(r, attempt * 1000));
            }
        }
        this.stats.failed++;
        log.warn('Webhook delivery failed after %d attempts: %s', MAX_ATTEMPTS, url);
    }
}

/** Compute the signature for a body — exported for tests and consumers. */
export function signBody(secret: string, body: string): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}
