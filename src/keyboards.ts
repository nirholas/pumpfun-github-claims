/**
 * PumpFun Channel Bot — Inline Keyboards
 *
 * Trade and chart destinations as tappable buttons instead of a wall of inline
 * links. The cards are long; buttons put the actions in a fixed place at the
 * bottom, are far easier to hit on a phone, and free several lines of vertical
 * space in the caption.
 *
 * Telegram caps a photo caption at 1024 characters, so moving links out of the
 * caption is also what keeps enriched cards from being truncated.
 */

import { buildTradeLinks, buildChartLinks, type Affiliates } from './trade-links.js';

export interface InlineButton {
    text: string;
    url: string;
}

export interface InlineKeyboard {
    inline_keyboard: InlineButton[][];
}

export type KeyboardAffiliates = Affiliates;

/**
 * Two rows: where to trade it, then where to look at it.
 * Telegram renders at most 8 buttons per row comfortably; three per row keeps
 * the labels readable on a narrow screen.
 */
export function buildTokenKeyboard(mint: string, affiliates: KeyboardAffiliates = {}): InlineKeyboard {
    const icons: Record<string, string> = {
        Axiom: '⚡', GMGN: '🐸', Padre: '🅿️', FOMO: '🔥',
        Chart: '📊', 'pump.fun': '💊', Solscan: '🔍',
    };
    const button = (l: { name: string; url: string }) => ({
        text: `${icons[l.name] ?? ''} ${l.name}`.trim(),
        url: l.url,
    });
    return {
        inline_keyboard: [
            buildTradeLinks(mint, affiliates).map(button),
            buildChartLinks(mint).map(button),
        ],
    };
}

/** Single row pointing at a transaction, used on claim and distribution cards. */
export function buildTxKeyboard(mint: string, txSignature: string, affiliates: KeyboardAffiliates = {}): InlineKeyboard {
    const keyboard = buildTokenKeyboard(mint, affiliates);
    keyboard.inline_keyboard.push([{ text: '🧾 Transaction', url: `https://solscan.io/tx/${txSignature}` }]);
    return keyboard;
}
