/**
 * Tests for the single source of truth for outbound trading links.
 * These links are revenue, so a wrong referral form is a real defect.
 *
 * The documented referral forms (see trade-links.ts):
 *   GMGN  {code}_{contract} in the token path
 *   FOMO  fomo.family/r/{code} (no per-token route)
 *   Axiom and Padre document no referral form on token deep links,
 *   so those stay clean.
 */

import { describe, it, expect } from 'vitest';

import { buildTradeLinks, buildChartLinks, renderTradeLinkRow } from '../trade-links.js';

const MINT = 'MintSynthetic1111111111111111111111111111111';
const AFF = { axiom: 'nich', gmgn: 'nichxbt', padre: 'nichxbt', fomo: 'nichxbt' };

describe('buildTradeLinks', () => {
    it('applies the documented referral form on every venue that has one', () => {
        const links = buildTradeLinks(MINT, AFF);
        const byName = Object.fromEntries(links.map((l) => [l.name, l.url]));
        expect(byName.GMGN).toBe(`https://gmgn.ai/sol/token/nichxbt_${MINT}`);
        expect(byName.FOMO).toBe('https://fomo.family/r/nichxbt');
    });

    it('keeps token deep links clean on venues that document no token referral form', () => {
        const links = buildTradeLinks(MINT, AFF);
        const byName = Object.fromEntries(links.map((l) => [l.name, l.url]));
        expect(byName.Axiom).toBe(`https://axiom.trade/t/${MINT}`);
        expect(byName.Padre).toBe(`https://trade.padre.gg/trade/solana/${MINT}`);
    });

    it('keeps the mint in the path for every per-token venue', () => {
        for (const link of buildTradeLinks(MINT, AFF)) {
            if (link.name === 'FOMO') continue; // referral entry point, no token route
            expect(link.url).toContain(MINT);
        }
    });

    it('still produces working links when no codes are configured', () => {
        const links = buildTradeLinks(MINT);
        const byName = Object.fromEntries(links.map((l) => [l.name, l.url]));
        expect(byName.GMGN).toBe(`https://gmgn.ai/sol/token/${MINT}`);
        expect(byName.FOMO).toBe('https://fomo.family');
        for (const link of links) {
            expect(link.url).toMatch(/^https:\/\//);
            expect(link.url).not.toContain('undefined');
        }
    });
});

describe('buildChartLinks', () => {
    it('carries no referral codes', () => {
        for (const link of buildChartLinks(MINT)) {
            expect(link.url).not.toContain('ref=');
            expect(link.url).toContain(MINT);
        }
    });
});

describe('renderTradeLinkRow', () => {
    it('renders every venue as an anchor with its short label', () => {
        const row = renderTradeLinkRow(MINT, AFF);
        for (const short of ['AXI', 'GMG', 'PDR', 'FMO']) {
            expect(row).toContain(`>${short}</a>`);
        }
        expect(row).toContain(`nichxbt_${MINT}`);
        expect(row).toContain('fomo.family/r/nichxbt');
    });
});
