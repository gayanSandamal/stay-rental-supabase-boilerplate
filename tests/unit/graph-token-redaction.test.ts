import { afterEach, describe, expect, it, vi } from 'vitest';
import { graphInsightValue, redactAccessTokens } from '@/lib/social/adapters/graph';
import { socialConfig } from '@/lib/social/config';

// Graph's `paging` URLs embed the Page access token; a stored metrics_error once
// carried one in plaintext, which forced a rotation.

describe('redactAccessTokens', () => {
  it('masks raw, JSON-escaped and URL-encoded tokens', () => {
    const raw = 'https://graph.facebook.com/x/insights?access_token=EAAUabc123&since=1';
    expect(redactAccessTokens(raw)).toBe(
      'https://graph.facebook.com/x/insights?access_token=[redacted]&since=1'
    );
    expect(redactAccessTokens(JSON.stringify({ previous: raw }))).not.toContain('EAAU');
    expect(redactAccessTokens('next=a%26access_token%3DEAAUxyz%26b')).not.toContain('EAAU');
  });

  it('masks a token cut off by truncation', () => {
    expect(redactAccessTokens('...insights?access_token=EAAUtruncat')).toBe(
      '...insights?access_token=[redacted]'
    );
  });
});

describe('graphInsightValue', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('never puts the token from a paging link into the error message', async () => {
    vi.spyOn(socialConfig, 'facebookPageAccessToken', 'get').mockReturnValue('EAAUsecret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [],
            paging: { previous: 'https://graph.facebook.com/v26.0/1_2/insights?access_token=EAAUsecret' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    const result = await graphInsightValue('1_2', ['post_media_view']);
    expect('error' in result && result.error.message).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain('EAAUsecret');
  });
});
