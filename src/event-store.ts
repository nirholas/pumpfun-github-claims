/**
 * PumpFun Channel Bot — Event Store
 *
 * In-memory ring buffer of recent feed events plus live subscriber fan-out.
 * Powers the read-only HTTP API (/events/recent, /events/stream) and the
 * /recent admin command. Events are compact JSON records, not Telegram HTML.
 */

export type FeedKind = 'claim' | 'launch' | 'graduation' | 'whale' | 'feeDistribution';

export interface StoredEvent {
    /** Monotonic sequence number, starts at 1 */
    seq: number;
    kind: FeedKind;
    /** Unix ms when the bot recorded the event */
    receivedAt: number;
    /** Token mint address, when the event has one */
    mint?: string;
    /** Solscan-linkable transaction signature, when known */
    txSignature?: string;
    /** One-line human summary (plain text, no HTML) */
    summary: string;
    /** Whether the event was posted to the Telegram channel */
    posted: boolean;
    /** Structured payload for API consumers */
    data: Record<string, unknown>;
}

export type EventListener = (event: StoredEvent) => void;

const DEFAULT_CAPACITY = 500;

export class EventStore {
    private buffer: StoredEvent[] = [];
    private capacity: number;
    private seq = 0;
    private listeners = new Set<EventListener>();
    readonly counters: Record<FeedKind, number> = {
        claim: 0,
        launch: 0,
        graduation: 0,
        whale: 0,
        feeDistribution: 0,
    };
    readonly startedAt = Date.now();

    constructor(capacity = DEFAULT_CAPACITY) {
        this.capacity = capacity;
    }

    record(input: Omit<StoredEvent, 'seq' | 'receivedAt'>): StoredEvent {
        const event: StoredEvent = {
            ...input,
            seq: ++this.seq,
            receivedAt: Date.now(),
        };
        this.buffer.push(event);
        if (this.buffer.length > this.capacity) this.buffer.shift();
        this.counters[event.kind]++;
        for (const listener of this.listeners) {
            try { listener(event); } catch { /* a broken subscriber never blocks the feed */ }
        }
        return event;
    }

    /** Mark an already-recorded event as posted to the channel. */
    markPosted(seq: number): void {
        const event = this.buffer.find((e) => e.seq === seq);
        if (event) event.posted = true;
    }

    recent(limit = 50, kind?: FeedKind): StoredEvent[] {
        const source = kind ? this.buffer.filter((e) => e.kind === kind) : this.buffer;
        return source.slice(-Math.max(1, Math.min(limit, this.capacity))).reverse();
    }

    get total(): number {
        return this.seq;
    }

    subscribe(listener: EventListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    get subscriberCount(): number {
        return this.listeners.size;
    }
}
