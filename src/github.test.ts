import { describe, expect, it, vi } from 'vitest';
import { exampleMarkdown } from './demo';
import { loadSource } from './github';
import { parseSourceUrl } from './urls';

const sourceUrl = 'https://github.com/octo-labs/recordings/pull/42';
const body = (html_url = sourceUrl, markdown = exampleMarkdown) => ({
  html_url,
  body: markdown,
  title: 'A sample recording',
  user: { login: 'octo-labs' },
});
const json = (value: unknown, headers?: Record<string, string>) =>
  new Response(JSON.stringify(value), { status: 200, headers });
const options = (fetcher: typeof fetch, token = '') => ({
  fetcher,
  token,
  signal: new AbortController().signal,
  progress: vi.fn(),
});

describe('GitHub API routing', () => {
  it.each([
    [sourceUrl, '/issues/42'],
    [`${sourceUrl}#issuecomment-76`, '/issues/comments/76'],
    [`${sourceUrl}#discussion_r76`, '/pulls/comments/76'],
    [`${sourceUrl}#pullrequestreview-76`, '/pulls/42/reviews/76'],
  ])('loads the exact source for %s', async (url, endpoint) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(body(url)));
    const source = await loadSource(parseSourceUrl(url), options(fetcher));
    expect(source.recordings).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `https://api.github.com/repos/octo-labs/recordings${endpoint}`,
    );
  });
  it('authenticates public resources using the supplied token without cookies or redirects', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(body()));
    await loadSource(
      parseSourceUrl(sourceUrl),
      options(fetcher, 'example-test-token'),
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer example-test-token' },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    expect(fetcher.mock.calls[0]?.[0]).not.toContain('example-test-token');
  });
  it('omits authorization without a token', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(body()));
    await loadSource(parseSourceUrl(sourceUrl), options(fetcher));
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      'Authorization',
    );
  });
  it('rejects a comment from a different issue', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json(
          body(
            'https://github.com/octo-labs/recordings/pull/43#issuecomment-76',
          ),
        ),
      );
    await expect(
      loadSource(
        parseSourceUrl(`${sourceUrl}#issuecomment-76`),
        options(fetcher),
      ),
    ).rejects.toThrow('does not belong');
  });
  it('does not silently fall back when a direct comment has no video', async () => {
    const url = `${sourceUrl}#issuecomment-76`;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(body(url, 'No attachment.')));
    await expect(
      loadSource(parseSourceUrl(url), options(fetcher)),
    ).rejects.toThrow('no supported');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('conversation discovery', () => {
  it('paginates comments and keeps credentials on the fixed API origin', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(body(sourceUrl, 'No attachment.')))
      .mockResolvedValueOnce(
        json([body(`${sourceUrl}#issuecomment-75`, 'No attachment.')], {
          link: '<https://evil.test/steal>; rel="next"',
        }),
      )
      .mockResolvedValueOnce(json([body(`${sourceUrl}#issuecomment-76`)]));
    const source = await loadSource(
      parseSourceUrl(sourceUrl),
      options(fetcher, 'example-test-token'),
    );
    expect(source.url).toBe(`${sourceUrl}#issuecomment-76`);
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      'https://api.github.com/repos/octo-labs/recordings/issues/42',
      'https://api.github.com/repos/octo-labs/recordings/issues/42/comments?per_page=100&page=1',
      'https://api.github.com/repos/octo-labs/recordings/issues/42/comments?per_page=100&page=2',
    ]);
  });
  it('finds review comments after checking conversation comments', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(body(sourceUrl, 'No attachment.')))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([body(`${sourceUrl}#discussion_r76`)]));
    const source = await loadSource(
      parseSourceUrl(sourceUrl),
      options(fetcher),
    );
    expect(source.url).toBe(`${sourceUrl}#discussion_r76`);
    expect(fetcher.mock.calls[2]?.[0]).toContain('/pulls/42/comments');
  });
  it('finds a video in a review body', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(body(sourceUrl, 'No attachment.')))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([body(`${sourceUrl}#pullrequestreview-76`)]));
    expect(
      (await loadSource(parseSourceUrl(sourceUrl), options(fetcher))).url,
    ).toBe(`${sourceUrl}#pullrequestreview-76`);
  });
  it('reports truncation instead of claiming no video exists', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(body(sourceUrl, 'No attachment.')))
      .mockImplementation(async () =>
        json([], { link: '<https://api.github.com/next>; rel="next"' }),
      );
    await expect(
      loadSource(parseSourceUrl(sourceUrl), options(fetcher)),
    ).rejects.toThrow('too large');
    expect(fetcher).toHaveBeenCalledTimes(11);
  });
});

describe('API failures', () => {
  it.each([
    [401, 'rejected the token'],
    [403, 'denied access'],
    [404, 'may be private'],
    [429, 'rate limit'],
    [500, 'HTTP 500'],
  ])('reports HTTP %s clearly', async (status, message) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status }));
    await expect(
      loadSource(parseSourceUrl(sourceUrl), options(fetcher)),
    ).rejects.toThrow(message);
  });
  it('reports exhausted anonymous API allowance', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{}', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'retry-after': '120' },
      }),
    );
    await expect(
      loadSource(parseSourceUrl(sourceUrl), options(fetcher)),
    ).rejects.toThrow('2 minute');
  });
  it('reports network failures', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      loadSource(parseSourceUrl(sourceUrl), options(fetcher)),
    ).rejects.toThrow('Could not reach GitHub');
  });
  it('rejects malformed JSON and unexpected API shapes', async () => {
    const invalidJson = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('not JSON'));
    const invalidShape = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ message: 'unexpected' }));
    await expect(
      loadSource(parseSourceUrl(sourceUrl), options(invalidJson)),
    ).rejects.toThrow('not valid JSON');
    await expect(
      loadSource(parseSourceUrl(sourceUrl), options(invalidShape)),
    ).rejects.toThrow('unexpected response');
  });
});
