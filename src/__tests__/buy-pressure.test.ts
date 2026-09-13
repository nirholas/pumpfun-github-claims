/**
 * Tests for the buy/sell flow summary shown on claim and graduation cards.
 */

import { describe, it, expect } from 'vitest';

import { summarizeBuyPressure, formatTicker } from '../formatters.js';
import type { TokenTradeInfo } from '../pump-client.js';

function trades(buyCount: number, sellCount: number): TokenTradeInfo {
    return { buyCount, sellCount, recentTradeCount: buyCount + sellCount, recentVolumeSol: 10 };
}

describe('summarizeBuyPressure', () => {
    it('says nothing without trade data', () => {
        expect(summarizeBuyPressure(null)).toBeNull();
        expect(summarizeBuyPressure(undefined)).toBeNull();
    });

    it('stays silent on thin flow rather than calling noise a trend', () => {
        // 3 buys and 1 sell is 75% buys, but it is 4 trades. Reporting
        // "buyers in control" off that would be a fabricated signal.
        expect(summarizeBuyPressure(trades(3, 1))).toBeNull();
    });

    it('reports buyers in control on strongly one-sided flow', () => {
        const out = summarizeBuyPressure(trades(45, 5));
        expect(out).toContain('90% buys');
        expect(out).toContain('buyers in control');
        expect(out).toContain('🟢');
    });

    it('reports sellers in control when the flow inverts', () => {
        const out = summarizeBuyPressure(trades(5, 45));
        expect(out).toContain('10% buys');
        expect(out).toContain('sellers in control');
        expect(out).toContain('🔴');
    });

    it('calls an even market balanced', () => {
        const out = summarizeBuyPressure(trades(25, 25));
        expect(out).toContain('50% buys');
        expect(out).toContain('balanced');
    });

    it('draws a ten-segment bar proportional to buy share', () => {
        const out = summarizeBuyPressure(trades(30, 70))!;
        const bar = out.slice(out.indexOf('[') + 1, out.indexOf(']'));
        expect(bar).toHaveLength(10);
        expect([...bar].filter((c) => c === '█')).toHaveLength(3);
    });
});

describe('formatTicker', () => {
    it('adds exactly one dollar sign to a plain symbol', () => {
        expect(formatTicker('PANIC')).toBe('$PANIC');
    });

    it('does not double the sign when the creator baked it into the symbol', () => {
        // This is the "$$PANIC" bug: pump.fun symbols routinely include the $.
        expect(formatTicker('$PANIC')).toBe('$PANIC');
        expect(formatTicker('$$PANIC')).toBe('$PANIC');
    });

    it('trims surrounding whitespace', () => {
        expect(formatTicker('  CATE ')).toBe('$CATE');
    });

    it('returns an empty string for a missing symbol rather than a bare $', () => {
        expect(formatTicker('')).toBe('');
        expect(formatTicker(null)).toBe('');
        expect(formatTicker(undefined)).toBe('');
        expect(formatTicker('$')).toBe('');
    });
});
