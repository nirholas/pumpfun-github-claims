/**
 * PumpFun Channel Bot — Trade Links
 *
 * One source of truth for every outbound trading link.
 *
 * These URLs used to be built inline in three separate places, and they had
 * drifted: the claim card carried referral codes while the graduation card,
 * which is the feed that actually runs, linked out with no codes at all and
 * earned nothing. Anything that links a user to a venue goes through here.
 */

export interface Affiliates {
    axiom?: string;
    gmgn?: string;
    padre?: string;
    fomo?: string;
}

export interface TradeLink {
    /** Full label, e.g. "Axiom" */
    name: string;
    /** Three-letter label used in the tight inline row */
    short: string;
    url: string;
}

/**
 * Every trading venue for a mint, with referral codes applied.
 *
 * Each URL keeps the token address in the path so the link lands on the token
 * itself, not on a bare referral splash page. A venue with no configured code
 * still gets a working link.
 */
export function buildTradeLinks(mint: string, aff: Affiliates = {}): TradeLink[] {
    return [
        // GMGN's documented referral form is `{code}_{contract}` inside the
        // path (docs.gmgn.ai referral-link), so the deep link and the code
        // travel together. Axiom and Padre document NO referral form on token
        // deep links (only @handle / rk signup pages) and an invented `?ref=`
        // earns nothing, so their token links stay clean; this matches
        // three.ws src/shared/trading-terminals.js.
        { name: 'Axiom', short: 'AXI', url: `https://axiom.trade/t/${mint}` },
        { name: 'GMGN', short: 'GMG', url: `https://gmgn.ai/sol/token/${aff.gmgn ? `${encodeURIComponent(aff.gmgn)}_` : ''}${mint}` },
        { name: 'Padre', short: 'PDR', url: `https://trade.padre.gg/trade/solana/${mint}` },
        // FOMO's documented referral form is fomo.family/r/<code>. It has no
        // per-token route, so unlike the others this one lands on the referral
        // page rather than the mint.
        { name: 'FOMO', short: 'FMO', url: aff.fomo ? `https://fomo.family/r/${encodeURIComponent(aff.fomo)}` : 'https://fomo.family' },
    ];
}

/** Chart and explorer destinations. These carry no referral codes. */
export function buildChartLinks(mint: string): TradeLink[] {
    return [
        { name: 'Chart', short: 'DEX', url: `https://dexscreener.com/solana/${mint}` },
        { name: 'pump.fun', short: 'PF', url: `https://pump.fun/coin/${mint}` },
        { name: 'Solscan', short: 'SCN', url: `https://solscan.io/token/${mint}` },
    ];
}

/** Compact "AXI⋅GMG⋅PDR⋅FMO" row for inside a card caption. */
export function renderTradeLinkRow(mint: string, aff: Affiliates = {}): string {
    return buildTradeLinks(mint, aff)
        .map((l) => `<a href="${l.url}">${l.short}</a>`)
        .join('⋅');
}
