import { readFile } from 'node:fs/promises';
import type { Page, Route } from '@playwright/test';
import type { VideoMetadata } from '../src/schema';

export const SOURCE = 'https://github.com/octo-labs/recordings/pull/42';
export const VIDEO =
  'https://github.com/user-attachments/assets/11111111-1111-4111-8111-111111111111';
export const SECOND_VIDEO =
  'https://github.com/user-attachments/assets/22222222-2222-4222-8222-222222222222';
export const MEDIA_FILE = new URL(
  '../public/demo/walkthrough.mp4',
  import.meta.url,
);

export const metadata: VideoMetadata = {
  version: 1,
  video: VIDEO,
  title: 'Reviewing the video loader',
  chapters: [
    {
      at: 0,
      title: 'Read the source',
      description: 'Find the attached recording.',
    },
    {
      at: 10,
      title: 'Load the recording',
      description: 'Start the browser player.',
    },
    {
      at: 20,
      title: 'Check the result',
      description: 'Review the final behavior.',
    },
  ],
  reasoning: [
    {
      at: 0,
      kind: 'observation',
      title: 'The source has one recording',
      text: 'Read the exact linked comment.',
    },
    {
      at: 5,
      kind: 'decision',
      title: 'Keep metadata with the video',
      text: 'Read the hidden JSON in the same body.',
    },
    {
      at: 10,
      kind: 'action',
      title: 'Load the selected attachment',
      text: 'Use the native browser video element.',
    },
    {
      at: 20,
      kind: 'result',
      title: 'The recording is ready',
      text: 'Chapters and recorded notes can now follow playback.',
    },
  ],
};

export function markdown(value = metadata): string {
  const json = JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e');
  return `${value.video}\n\n<!-- video-navigator\n${json}\n-->`;
}

export async function apiResponse(
  route: Route,
  body: string,
  url = SOURCE,
): Promise<void> {
  await route.fulfill({
    json: {
      body,
      html_url: url,
      title: 'Sample video review',
      user: { login: 'octo-labs' },
    },
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

export async function mockSource(
  page: Page,
  body = markdown(),
  url = SOURCE,
): Promise<void> {
  await page.route('https://api.github.com/**', async (route) => {
    await apiResponse(route, body, url);
  });
  const buffer = await readFile(MEDIA_FILE);
  await page.route(
    'https://github.com/user-attachments/assets/**',
    async (route) => {
      const range = route
        .request()
        .headers()
        .range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = Number(range?.[1] ?? 0);
      const end = Math.min(
        Number(range?.[2] || buffer.length - 1),
        buffer.length - 1,
      );
      await route.fulfill({
        status: range ? 206 : 200,
        contentType: 'video/mp4',
        headers: {
          'Accept-Ranges': 'bytes',
          ...(range
            ? { 'Content-Range': `bytes ${start}-${end}/${buffer.length}` }
            : {}),
        },
        body: range ? buffer.subarray(start, end + 1) : buffer,
      });
    },
  );
}

export function sourceQuery(time = 0, video = 1, source = SOURCE): string {
  return `?${new URLSearchParams({ url: source, t: String(time), video: String(video) })}`;
}
