/**
 * Impersonation gate for GitHub claim cards.
 *
 * A repository-owner match is circular when the claimer controls both sides:
 * anyone can register a lookalike GitHub account, push a repo, put that repo in
 * a copycat coin's metadata, delegate the coin's fees to the account and claim
 * them. On 2026-09-17 `mikelnspace` (created two days earlier) did exactly that
 * with a copy of a coin whose fees go to the nine-year-old `mikeinspace`, and
 * the card went out marked verified.
 *
 * A young account alone is not suspicious, and neither is a same-name coin; the
 * combination is the scam's signature, so both must hold before a card is held.
 */

import type { GitHubRepoInfo, GitHubUserInfo } from './github-client.js';
import type { SameNameToken, TokenInfo } from './pump-client.js';

/** Accounts younger than this cannot vouch for a coin on their own. */
export const NEW_ACCOUNT_DAYS = 30;
/** A repo created this close to the claim was likely made for the coin. */
export const FRESH_REPO_DAYS = 7;
/** A same-name coin this many times larger marks this one as the copy. */
export const COPYCAT_MCAP_RATIO = 1.5;

export interface ImpersonationInput {
    githubUser: GitHubUserInfo | null;
    tokenInfo: TokenInfo | null;
    sameNameTokens?: SameNameToken[] | null;
    repoInfo?: GitHubRepoInfo | null;
}

export interface ImpersonationAssessment {
    suspected: boolean;
    reasons: string[];
}

const DAY_MS = 86_400_000;

function ageDays(iso: string | undefined, nowMs: number): number | null {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? (nowMs - t) / DAY_MS : null;
}

export function assessImpersonation(input: ImpersonationInput, nowMs = Date.now()): ImpersonationAssessment {
    const accountAge = ageDays(input.githubUser?.createdAt, nowMs);
    if (accountAge == null || accountAge >= NEW_ACCOUNT_DAYS) return { suspected: false, reasons: [] };

    const reasons = [`GitHub account ${Math.floor(accountAge)}d old`];
    const top = input.sameNameTokens?.[0];
    const copycat = Boolean(top && input.tokenInfo
        && top.usdMarketCap > input.tokenInfo.usdMarketCap * COPYCAT_MCAP_RATIO);
    if (copycat) reasons.push(`same-name coin ${top!.mint.slice(0, 6)} is larger ($${Math.round(top!.usdMarketCap)})`);

    const repoAge = ageDays(input.repoInfo?.createdAt, nowMs);
    const freshRepo = repoAge != null && repoAge < FRESH_REPO_DAYS;
    if (freshRepo) reasons.push(`metadata repo ${Math.floor(repoAge!)}d old`);

    return { suspected: copycat || freshRepo, reasons };
}
