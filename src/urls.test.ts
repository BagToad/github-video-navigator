import { describe, expect, it } from 'vitest';
import {
  parseSourceUrl,
  readLocation,
  removeUrlCredentials,
  shareUrl,
  videoUrl,
} from './urls';

describe('GitHub source URLs', () => {
  it.each([
    ['https://github.com/octo-labs/recordings/issues/42', 'issue', undefined],
    ['https://github.com/octo-labs/recordings/pull/42', 'pull', undefined],
    [
      'https://github.com/octo-labs/recordings/pull/42#issuecomment-76',
      'pull',
      { kind: 'comment', id: '76' },
    ],
    [
      'https://github.com/octo-labs/recordings/issues/42#issuecomment-76',
      'issue',
      { kind: 'comment', id: '76' },
    ],
    [
      'https://github.com/octo-labs/recordings/pull/42#discussion_r76',
      'pull',
      { kind: 'review-comment', id: '76' },
    ],
    [
      'https://github.com/octo-labs/recordings/pull/42/files#r76',
      'pull',
      { kind: 'review-comment', id: '76' },
    ],
    [
      'https://github.com/octo-labs/recordings/pull/42/changes/abcdef123#r76',
      'pull',
      { kind: 'review-comment', id: '76' },
    ],
    [
      'https://github.com/octo-labs/recordings/pull/42#pullrequestreview-76',
      'pull',
      { kind: 'review', id: '76' },
    ],
    [
      'https://github.com/octo-labs/recordings/issues/42#issue-678',
      'issue',
      undefined,
    ],
  ])('parses %s', (input, kind, anchor) => {
    expect(parseSourceUrl(input)).toMatchObject({
      owner: 'octo-labs',
      repo: 'recordings',
      number: '42',
      kind,
      anchor,
    });
  });

  it('canonicalizes file anchors and drops source query parameters', () => {
    expect(
      parseSourceUrl(
        'https://github.com/octo-labs/recordings/pull/42/files?diff=split#r76',
      ).url,
    ).toBe('https://github.com/octo-labs/recordings/pull/42#discussion_r76');
  });

  it.each([
    'not a url',
    'http://github.com/octo-labs/recordings/issues/42',
    'https://github.com.evil.test/octo-labs/recordings/issues/42',
    'https://github.com@evil.test/octo-labs/recordings/issues/42',
    'https://secret@github.com/octo-labs/recordings/issues/42',
    'https://github.com:8443/octo-labs/recordings/issues/42',
    'https://github.com/octo-labs/recordings/issues/0',
    'https://github.com/octo-labs/recordings/issues/42/files',
    'https://github.com/octo-labs/recordings/issues/42#discussion_r76',
    'https://github.com/octo-labs/recordings/pull/42#unsupported',
    'https://github.com/octo-labs/recordings/discussions/42',
  ])('rejects unsupported or unsafe input: %s', (input) => {
    expect(() => parseSourceUrl(input)).toThrow();
  });
});

describe('media URLs', () => {
  it.each([
    'https://github.com/user-attachments/assets/11111111-1111-4111-8111-111111111111',
    'https://github.com/octo-labs/recordings/assets/42/11111111-1111-4111-8111-111111111111',
    'https://user-images.githubusercontent.com/42/example.mp4',
    'https://private-user-images.githubusercontent.com/42/example.mov?jwt=example',
    'https://raw.githubusercontent.com/octo-labs/recordings/main/demo.webm',
  ])('accepts a GitHub video: %s', (url) => {
    expect(videoUrl(url)).toBe(url);
  });
  it.each([
    'https://evil.test/movie.mp4',
    'https://user-images.githubusercontent.com.evil.test/42/movie.mp4',
    'https://user-images.githubusercontent.com/42/image.png',
    'javascript:alert(1)',
    'data:video/mp4,AAAA',
    'https://github.com/user-attachments/files/42/file.json',
    'https://secret@user-images.githubusercontent.com/42/movie.mp4',
  ])('rejects unsupported media: %s', (url) => {
    expect(videoUrl(url)).toBeUndefined();
  });
});

describe('navigator deep links', () => {
  const source =
    'https://github.com/octo-labs/recordings/pull/42#issuecomment-76';
  it('round trips a comment, selected video, and fractional timestamp', () => {
    const link = shareUrl(
      'https://example.test/navigator/?token=discard#secret',
      source,
      2,
      12.125,
    );
    const state = readLocation(new URL(link));
    expect(state).toEqual({
      source: parseSourceUrl(source),
      demo: false,
      video: 2,
      time: 12.125,
    });
    expect(link).not.toContain('discard');
    expect(link).not.toContain('secret');
  });
  it('shares the local demo without a source or token', () => {
    expect(
      shareUrl(
        'https://example.test/navigator/?token=discard',
        undefined,
        1,
        10,
      ),
    ).toBe('https://example.test/navigator/?demo=1&t=10');
  });
  it.each([
    '?demo=1&t=-1',
    '?demo=1&t=Infinity',
    '?demo=1&t=604801',
    '?demo=1&video=0',
    '?demo=1&video=1.5',
    '?demo=1&video=101',
    '?demo=1&t=1&t=2',
    '?demo=1&url=https://github.com/octo-labs/recordings/pull/42',
    '?t=10',
    '?demo=0',
  ])('reports malformed state: %s', (query) => {
    expect(() =>
      readLocation(new URL(`https://example.test/${query}`)),
    ).toThrow();
  });
  it('removes credentials instead of reading them', () => {
    const url = new URL(
      'https://example.test/?demo=1&token=secret&access_token=secret#token=secret',
    );
    expect(removeUrlCredentials(url)).toBe(true);
    expect(url.href).toBe('https://example.test/?demo=1');
  });
});
