import { describe, expect, it } from 'vitest';
import { normalizedReservePrice } from '../pump-client.js';

describe('normalized reserve pricing', () => {
    it('converts lamports/token-base-units into SOL per whole token', () => {
        expect(normalizedReservePrice(30e9, 600e6 * 1e6, 6, 9)).toBeCloseTo(0.00000005, 12);
    });
    it('supports quote assets with non-SOL decimals', () => {
        expect(normalizedReservePrice(12_000e6, 600e6 * 1e6, 6, 6)).toBeCloseTo(0.00002, 12);
    });
    it('returns zero for empty reserves', () => {
        expect(normalizedReservePrice(1, 0)).toBe(0);
    });
});
