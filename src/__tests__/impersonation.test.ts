import { describe, expect, it } from 'vitest';
import { assessImpersonation } from '../impersonation.js';
import type { GitHubRepoInfo, GitHubUserInfo } from '../github-client.js';
import type { SameNameToken, TokenInfo } from '../pump-client.js';

// 2026-09-17: `mikelnspace` (created 2026-09-14) claimed fees from a "Memepool
// Moth" copy whose original pays the 2017 account `mikeinspace`.
const NOW = Date.parse('2026-09-17T01:20:45Z');
const user = (createdAt: string) => ({ login: 'x', createdAt }) as GitHubUserInfo;
const token = (usdMarketCap: number) => ({ usdMarketCap }) as TokenInfo;
const original = [{ mint: '4xd5GwBhRrkHdf5o5M1rrHwboQCsf8yoLxGDPj1SRD6V', usdMarketCap: 295_136 }] as SameNameToken[];
const repo = (createdAt: string) => ({ createdAt }) as GitHubRepoInfo;

describe('impersonation gate', () => {
    it('holds the real lookalike claim: new account on a smaller same-name copy', () => {
        const result = assessImpersonation({ githubUser: user('2026-09-14T03:42:25Z'), tokenInfo: token(4_760),
            sameNameTokens: original, repoInfo: repo('2026-09-17T01:14:00Z') }, NOW);
        expect(result.suspected).toBe(true);
        expect(result.reasons).toHaveLength(3);
    });

    it('holds a new account whose metadata repo was created for the coin', () => {
        expect(assessImpersonation({ githubUser: user('2026-09-10T00:00:00Z'), tokenInfo: token(50_000),
            sameNameTokens: [], repoInfo: repo('2026-09-16T00:00:00Z') }, NOW).suspected).toBe(true);
    });

    it('passes an established account even on a crowded name', () => {
        expect(assessImpersonation({ githubUser: user('2017-07-21T16:41:27Z'), tokenInfo: token(4_760),
            sameNameTokens: original, repoInfo: repo('2026-09-17T01:14:00Z') }, NOW).suspected).toBe(false);
    });

    it('passes a new account with an old repo and no larger same-name coin', () => {
        expect(assessImpersonation({ githubUser: user('2026-09-10T00:00:00Z'), tokenInfo: token(500_000),
            sameNameTokens: original, repoInfo: repo('2025-01-01T00:00:00Z') }, NOW).suspected).toBe(false);
    });

    it('passes when the account age is unknown', () => {
        expect(assessImpersonation({ githubUser: null, tokenInfo: token(1), sameNameTokens: original }, NOW).suspected).toBe(false);
    });
});
