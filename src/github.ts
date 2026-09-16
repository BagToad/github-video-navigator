import { z } from 'zod';
import { NavigatorError } from './errors';
import { parseDocument, type ParsedDocument } from './metadata';
import { parseSourceUrl, type SourceReference } from './urls';

const API_ORIGIN = 'https://api.github.com';
const MAX_PAGES = 10;
const bodySchema = z.object({
  body: z.string().nullable(),
  html_url: z.string(),
  title: z.string().optional(),
  user: z.object({ login: z.string() }).nullable().optional(),
});

export interface VideoSource extends ParsedDocument {
  url: string;
  title: string;
  author: string;
  label: string;
}

export interface LoadOptions {
  token: string;
  signal: AbortSignal;
  progress: (message: string) => void;
  fetcher?: typeof fetch;
}

function describe(reference: SourceReference): string {
  if (reference.anchor?.kind === 'comment') return 'Comment';
  if (reference.anchor?.kind === 'review-comment') return 'Review comment';
  if (reference.anchor?.kind === 'review') return 'Review';
  return reference.kind === 'pull' ? 'Pull request' : 'Issue';
}

function documentSource(
  value: unknown,
  reference: SourceReference,
): VideoSource {
  const parsed = bodySchema.safeParse(value);
  if (!parsed.success) {
    throw new NavigatorError(
      'GitHub returned an unexpected response format.',
      'api',
    );
  }
  let actual: SourceReference;
  try {
    actual = parseSourceUrl(parsed.data.html_url);
  } catch {
    throw new NavigatorError(
      'GitHub returned an unsupported source permalink.',
      'api',
    );
  }
  if (
    actual.owner.toLowerCase() !== reference.owner.toLowerCase() ||
    actual.repo.toLowerCase() !== reference.repo.toLowerCase() ||
    actual.number !== reference.number ||
    (reference.anchor &&
      (actual.anchor?.id !== reference.anchor.id ||
        actual.anchor.kind !== reference.anchor.kind))
  ) {
    throw new NavigatorError(
      'This comment does not belong to the linked issue or pull request.',
      'input',
    );
  }
  return {
    ...parseDocument(parsed.data.body ?? ''),
    url: actual.url,
    title:
      parsed.data.title ??
      `${describe(actual)} in ${actual.owner}/${actual.repo} #${actual.number}`,
    author: parsed.data.user?.login ?? 'Deleted user',
    label: `${actual.owner}/${actual.repo} #${actual.number}`,
  };
}

function retryMessage(response: Response): string {
  const retry = Number(response.headers.get('retry-after'));
  if (retry > 0 && Number.isFinite(retry)) {
    return ` Try again in ${Math.ceil(retry / 60)} minute(s).`;
  }
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  if (reset > 0 && Number.isFinite(reset)) {
    const minutes = Math.ceil((reset * 1000 - Date.now()) / 60_000);
    if (minutes > 0) return ` Try again in ${minutes} minute(s).`;
  }
  return ' Wait before retrying.';
}

async function request(path: string, options: LoadOptions): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(`${API_ORIGIN}${path}`, {
      headers,
      signal: AbortSignal.any([options.signal, AbortSignal.timeout(20_000)]),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    if (options.signal.aborted) throw error;
    throw new NavigatorError(
      'Could not reach GitHub. Check your connection or browser restrictions. If the repository moved, use its current URL. Requests time out after 20 seconds.',
      'network',
    );
  }
  if (response.ok) return response;
  if (
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get('x-ratelimit-remaining') === '0' ||
        response.headers.has('retry-after')))
  ) {
    throw new NavigatorError(
      `GitHub's API rate limit was reached.${retryMessage(response)} A token can increase the public API allowance.`,
      'rate-limit',
    );
  }
  if (response.status === 401) {
    throw new NavigatorError(
      'GitHub rejected the token. Clear it or provide a valid token with repository read access.',
      'api',
    );
  }
  if (response.status === 403) {
    throw new NavigatorError(
      'GitHub denied access. Check repository permissions, organization SSO authorization, or a temporary API restriction.',
      'api',
    );
  }
  if (response.status === 404) {
    throw new NavigatorError(
      'GitHub could not find this resource. It may be private, deleted, or inaccessible to this token.',
      'not-found',
    );
  }
  throw new NavigatorError(
    `GitHub returned HTTP ${response.status}. Try again later.`,
    'api',
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new NavigatorError(
      'GitHub returned a response that was not valid JSON.',
      'api',
    );
  }
}

export async function loadSource(
  reference: SourceReference,
  options: LoadOptions,
): Promise<VideoSource> {
  const root = `/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(reference.repo)}`;
  const issue = `${root}/issues/${reference.number}`;
  let path = issue;
  if (reference.anchor?.kind === 'comment') {
    path = `${root}/issues/comments/${reference.anchor.id}`;
  } else if (reference.anchor?.kind === 'review-comment') {
    path = `${root}/pulls/comments/${reference.anchor.id}`;
  } else if (reference.anchor?.kind === 'review') {
    path = `${root}/pulls/${reference.number}/reviews/${reference.anchor.id}`;
  }
  options.progress(`Reading ${describe(reference).toLowerCase()}...`);
  const source = documentSource(
    await readJson(await request(path, options)),
    reference,
  );
  if (source.recordings.length) return source;
  if (reference.anchor) {
    throw new NavigatorError(
      [
        'This comment contains no supported GitHub video.',
        ...source.warnings,
      ].join(' '),
      'not-found',
    );
  }

  const collections = [
    { path: `${issue}/comments`, label: 'discussion comments' },
    ...(reference.kind === 'pull'
      ? [
          {
            path: `${root}/pulls/${reference.number}/comments`,
            label: 'review comments',
          },
          {
            path: `${root}/pulls/${reference.number}/reviews`,
            label: 'reviews',
          },
        ]
      : []),
  ];
  for (const collection of collections) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      options.progress(`Checking ${collection.label} (page ${page})...`);
      const response = await request(
        `${collection.path}?per_page=100&page=${page}`,
        options,
      );
      const values = await readJson(response);
      if (!Array.isArray(values)) {
        throw new NavigatorError(
          'GitHub returned an unexpected comment list.',
          'api',
        );
      }
      for (const value of values) {
        const candidate = documentSource(value, reference);
        if (candidate.recordings.length) return candidate;
      }
      if (!/\brel="next"/.test(response.headers.get('link') ?? '')) break;
      if (page === MAX_PAGES) {
        throw new NavigatorError(
          'This conversation is too large to scan automatically. Paste a direct link to the comment containing the video.',
          'api',
        );
      }
    }
  }
  throw new NavigatorError(
    [
      'No supported video was found in the body or comments. Use a GitHub attachment, or a GitHub-hosted .mp4, .mov, or .webm link.',
      ...source.warnings,
    ].join(' '),
    'not-found',
  );
}
