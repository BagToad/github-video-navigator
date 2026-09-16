import { NavigatorError } from './errors';

export const SITE_URL = 'https://bagtoad.github.io/github-video-navigator/';
export const SCHEMA_URL = `${SITE_URL}schema/v1.json`;
export const MAX_TIME = 604_800;

export type SourceAnchor = {
  kind: 'comment' | 'review-comment' | 'review';
  id: string;
};

export interface SourceReference {
  owner: string;
  repo: string;
  kind: 'issue' | 'pull';
  number: string;
  anchor?: SourceAnchor;
  url: string;
}

export const VIDEO_URL_PATTERN =
  /^https:\/\/(?:github\.com\/(?:user-attachments\/assets\/[a-fA-F0-9-]{36}|[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/assets\/\d+\/[a-fA-F0-9-]{36})|(?:user-images|private-user-images|raw)\.githubusercontent\.com\/[^\s?#]+\.(?:[mM][pP]4|[mM][oO][vV]|[wW][eE][bB][mM]))(?:\?[^\s#]*)?$/;

export function videoUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.port) return undefined;
    url.hash = '';
    return VIDEO_URL_PATTERN.test(url.href) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function parseSourceUrl(input: string): SourceReference {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new NavigatorError(
      'Enter a complete GitHub issue, pull request, or comment URL.',
      'input',
    );
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new NavigatorError(
      'Use an https://github.com link without embedded credentials.',
      'input',
    );
  }

  const path = url.pathname.match(
    /^\/([a-z0-9-]{1,39})\/([a-z0-9_.-]{1,100})\/(issues|pull)\/([1-9]\d{0,15})(?:\/(?:files|changes|commits)(?:\/[a-f0-9]{7,40})?)?\/?$/i,
  );
  if (!path) {
    throw new NavigatorError(
      'This is not a supported GitHub issue or pull request link. Copy the link to its body or a specific comment.',
      'input',
    );
  }
  const [, owner, repo, section, number] = path;
  if (!owner || !repo || !section || !number) {
    throw new NavigatorError('The GitHub link is incomplete.', 'input');
  }
  const kind = section === 'pull' ? 'pull' : 'issue';
  if (kind === 'issue' && /\/(?:files|changes|commits)/.test(url.pathname)) {
    throw new NavigatorError(
      'This issue URL has an unsupported path.',
      'input',
    );
  }
  let anchor: SourceAnchor | undefined;
  const comment = url.hash.match(/^#issuecomment-([1-9]\d*)$/);
  const reviewComment = url.hash.match(/^#(?:discussion_r|r)([1-9]\d*)$/);
  const review = url.hash.match(/^#pullrequestreview-([1-9]\d*)$/);
  if (comment?.[1]) {
    anchor = { kind: 'comment', id: comment[1] };
  } else if (kind === 'pull' && reviewComment?.[1]) {
    anchor = { kind: 'review-comment', id: reviewComment[1] };
  } else if (kind === 'pull' && review?.[1]) {
    anchor = { kind: 'review', id: review[1] };
  } else if (url.hash && !/^#(?:issue|pullrequest)-[1-9]\d*$/.test(url.hash)) {
    throw new NavigatorError(
      'This GitHub anchor is not supported. Copy the comment permalink, or remove the part after # to search the conversation.',
      'input',
    );
  }
  const hash = anchor
    ? `#${
        anchor.kind === 'comment'
          ? 'issuecomment-'
          : anchor.kind === 'review'
            ? 'pullrequestreview-'
            : 'discussion_r'
      }${anchor.id}`
    : '';
  return {
    owner,
    repo,
    kind,
    number,
    anchor,
    url: `https://github.com/${owner}/${repo}/${section}/${number}${hash}`,
  };
}

export interface LocationState {
  source?: SourceReference;
  demo: boolean;
  video: number;
  time: number;
}

export function readLocation(url: URL): LocationState {
  for (const name of ['url', 'demo', 'video', 't']) {
    if (url.searchParams.getAll(name).length > 1) {
      throw new NavigatorError(
        `The link contains more than one ${name} parameter.`,
        'input',
      );
    }
  }
  const source = url.searchParams.get('url');
  const demo = url.searchParams.get('demo');
  if (source && demo) {
    throw new NavigatorError(
      'Use either a GitHub URL or the demo in a link, not both.',
      'input',
    );
  }
  if (demo !== null && demo !== '1') {
    throw new NavigatorError('The demo parameter must be 1.', 'input');
  }
  const video = url.searchParams.get('video') ?? '1';
  const time = url.searchParams.get('t') ?? '0';
  if (!/^[1-9]\d{0,2}$/.test(video) || Number(video) > 100) {
    throw new NavigatorError(
      'The video parameter must be a number from 1 to 100.',
      'input',
    );
  }
  if (!/^\d+(?:\.\d+)?$/.test(time) || Number(time) > MAX_TIME) {
    throw new NavigatorError(
      'The t parameter must be a time in seconds between 0 and 604800.',
      'input',
    );
  }
  if (
    !source &&
    !demo &&
    (url.searchParams.has('video') || url.searchParams.has('t'))
  ) {
    throw new NavigatorError(
      'A timestamp or video selection also needs a url or demo parameter.',
      'input',
    );
  }
  return {
    source: source ? parseSourceUrl(source) : undefined,
    demo: demo === '1',
    video: Number(video),
    time: Number(time),
  };
}

export function removeUrlCredentials(url: URL): boolean {
  let removed = false;
  for (const name of [...url.searchParams.keys()]) {
    if (
      /^(?:token|access_token|auth|authorization|github_token|pat)$/i.test(name)
    ) {
      url.searchParams.delete(name);
      removed = true;
    }
  }
  if (/^#(?:token|access_token|auth|github_token)=/i.test(url.hash)) {
    url.hash = '';
    removed = true;
  }
  return removed;
}

export function shareUrl(
  base: string,
  source: string | undefined,
  video: number,
  time = 0,
): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  if (source) url.searchParams.set('url', parseSourceUrl(source).url);
  else url.searchParams.set('demo', '1');
  if (video > 1) url.searchParams.set('video', String(video));
  if (time > 0) url.searchParams.set('t', String(Number(time.toFixed(3))));
  return url.href;
}
