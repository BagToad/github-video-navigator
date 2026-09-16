import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  apiResponse,
  markdown,
  MEDIA_FILE,
  metadata,
  mockSource,
  SECOND_VIDEO,
  SOURCE,
  sourceQuery,
  VIDEO,
} from './fixtures';

async function currentTime(page: Page): Promise<number> {
  return page
    .locator('video')
    .evaluate((video: HTMLVideoElement) => video.currentTime);
}

async function videoReady(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator('video')
        .evaluate((video: HTMLVideoElement) => video.readyState),
    )
    .toBeGreaterThanOrEqual(1);
}

test('schema validation runs without violating the strict content security policy', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.addEventListener('securitypolicyviolation', (event) => {
      document.documentElement.dataset.cspViolation = event.violatedDirective;
    });
  });
  await mockSource(page);
  await page.goto(sourceQuery());
  await videoReady(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-csp-violation');
});

test('the built-in demo plays and updates notes on a real media clock', async ({
  page,
}) => {
  await page.goto('?demo=1&t=4.7');
  await videoReady(page);
  await expect.poll(() => currentTime(page)).toBeCloseTo(4.7, 1);
  await expect(page.locator('.note.is-current')).toContainText(
    'The recording is only part of the story',
  );
  await page.locator('video').evaluate(async (video: HTMLVideoElement) => {
    video.muted = true;
    await video.play();
  });
  await expect(page.locator('.note.is-current')).toContainText(
    'Keep the context beside the work',
  );
  await page
    .locator('video')
    .evaluate((video: HTMLVideoElement) => video.pause());
  await expect.poll(() => currentTime(page)).toBeGreaterThanOrEqual(5);
  await expect(page.locator('#error-panel')).toBeHidden();
  await expect(page.locator('#media-error')).toBeHidden();
});

test('chapter links, note links, backward seeks, and playback speed stay in sync', async ({
  page,
}) => {
  await mockSource(page);
  await page.goto(sourceQuery());
  await videoReady(page);
  await page
    .getByRole('link', {
      name: /0:20 Check the result/,
    })
    .click();
  await expect.poll(() => currentTime(page)).toBeCloseTo(20, 1);
  await expect(
    page.locator('.chapter-link[aria-current="true"]'),
  ).toContainText('Check the result');
  await expect(page.locator('.note.is-current')).toContainText(
    'The recording is ready',
  );
  await page
    .getByRole('link', {
      name: 'Jump to Keep metadata with the video at 0:05',
      exact: true,
    })
    .click();
  await expect.poll(() => currentTime(page)).toBeCloseTo(5, 1);
  await expect(page.locator('.note.is-current')).toContainText(
    'Keep metadata with the video',
  );
  await expect(
    page.locator('.chapter-link[aria-current="true"]'),
  ).toContainText('Read the source');
  await page.getByLabel('Speed', { exact: true }).selectOption('1.5');
  await expect
    .poll(() =>
      page
        .locator('video')
        .evaluate((video: HTMLVideoElement) => video.playbackRate),
    )
    .toBe(1.5);
});

test('direct comment links use the correct API endpoint and support fractional starts', async ({
  page,
}) => {
  const comment = `${SOURCE}#discussion_r76`;
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://api.github.com/'))
      requests.push(request.url());
  });
  await mockSource(page, markdown(), comment);
  await page.goto(sourceQuery(12.125, 1, `${SOURCE}/files#r76`));
  await videoReady(page);
  await expect.poll(() => currentTime(page)).toBeCloseTo(12.125, 2);
  expect(requests).toEqual([
    'https://api.github.com/repos/octo-labs/recordings/pulls/comments/76',
  ]);
  await expect(page.locator('#source-link')).toHaveAttribute('href', comment);
  await expect(page.locator('video')).not.toHaveAttribute('crossorigin');
});

test('simultaneous notes form a current group with no note active before the first timestamp', async ({
  page,
}) => {
  const value = {
    ...metadata,
    reasoning: [
      { at: 5, title: 'First simultaneous note', text: 'First note.' },
      { at: 5, title: 'Second simultaneous note', text: 'Second note.' },
      { at: 10, title: 'Later note', text: 'Later note.' },
    ],
  };
  await mockSource(page, markdown(value));
  await page.goto(sourceQuery());
  await videoReady(page);
  await expect(page.locator('.note.is-current')).toHaveCount(0);
  await expect(page.locator('#reasoning-position')).toHaveText(
    'First note at 0:05',
  );
  await page
    .getByRole('link', { name: 'Jump to First simultaneous note at 0:05' })
    .click();
  await expect(page.locator('.note.is-current')).toHaveCount(2);
  await page.getByRole('link', { name: 'Jump to Later note at 0:10' }).click();
  await expect(page.locator('.note.is-current')).toHaveCount(1);
  await page.getByRole('link', { name: /0:00 Read the source/ }).click();
  await expect(page.locator('.note.is-current')).toHaveCount(0);
});

test('selecting another recording resets playback and generates a stable share link', async ({
  page,
}) => {
  const second = {
    ...metadata,
    video: SECOND_VIDEO,
    title: 'A second recording',
  };
  await mockSource(page, `${markdown()}\n\n${markdown(second)}`);
  await page.goto(sourceQuery(10));
  await videoReady(page);
  await page.getByLabel('Recording', { exact: true }).selectOption('2');
  await expect(page.locator('#recording-title')).toHaveText(
    'A second recording',
  );
  await videoReady(page);
  await expect.poll(() => currentTime(page)).toBeCloseTo(0, 1);
  await page
    .getByRole('link', {
      name: /0:10 Load the recording/,
    })
    .click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const shared = new URL(await page.getByLabel('Navigator link').inputValue());
  expect(shared.searchParams.get('url')).toBe(SOURCE);
  expect(shared.searchParams.get('video')).toBe('2');
  expect(Number(shared.searchParams.get('t'))).toBeCloseTo(10, 1);
  await page.getByLabel('Start at 0:10', { exact: true }).uncheck();
  expect(
    new URL(
      await page.getByLabel('Navigator link').inputValue(),
    ).searchParams.has('t'),
  ).toBe(false);
});

test('a token authenticates public or private API reads but is never persisted, shared, or sent to media hosts', async ({
  page,
}) => {
  const requests: { url: string; authorization?: string }[] = [];
  page.on('request', (request) => {
    requests.push({
      url: request.url(),
      authorization: request.headers().authorization,
    });
  });
  await mockSource(page);
  await page.goto('./');
  await page.getByText('GitHub access', { exact: true }).click();
  await page
    .getByLabel('GitHub personal access token')
    .fill('example-test-token');
  await page.getByRole('button', { name: 'Use token', exact: true }).click();
  await expect(page.getByLabel('GitHub personal access token')).toHaveValue('');
  await expect(page.locator('#access-state')).toHaveText('Active in this tab');
  await page.getByLabel('GitHub link', { exact: true }).fill(SOURCE);
  await page.getByRole('button', { name: 'Open video', exact: true }).click();
  await videoReady(page);
  expect(requests.filter((request) => request.authorization)).toEqual([
    {
      url: 'https://api.github.com/repos/octo-labs/recordings/issues/42',
      authorization: 'Bearer example-test-token',
    },
  ]);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  expect(
    requests.some((request) => request.url.includes('example-test-token')),
  ).toBe(false);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  expect(await page.getByLabel('Navigator link').inputValue()).not.toContain(
    'token',
  );
  await page.reload();
  await videoReady(page);
  await expect(page.locator('#access-state')).toHaveText('Optional');
  expect(
    requests
      .filter((request) => request.url.startsWith('https://api.github.com/'))
      .at(-1)?.authorization,
  ).toBeUndefined();
});

test('clearing a token removes authorization from subsequent requests', async ({
  page,
}) => {
  await mockSource(page);
  const authorization: (string | undefined)[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://api.github.com/'))
      authorization.push(request.headers().authorization);
  });
  await page.goto('./');
  await page.getByText('GitHub access', { exact: true }).click();
  await page
    .getByLabel('GitHub personal access token')
    .fill('example-test-token');
  await page.getByRole('button', { name: 'Use token', exact: true }).click();
  await page.getByRole('button', { name: 'Clear token', exact: true }).click();
  await page.getByLabel('GitHub link', { exact: true }).fill(SOURCE);
  await page.getByRole('button', { name: 'Open video', exact: true }).click();
  await videoReady(page);
  expect(authorization).toEqual([undefined]);
});

test('a rejected private request can be retried with a token', async ({
  page,
}) => {
  await mockSource(page);
  await page.route('https://api.github.com/**', async (route) => {
    if (!route.request().headers().authorization) {
      await route.fulfill({ status: 404, json: { message: 'Not Found' } });
    } else {
      await apiResponse(route, markdown());
    }
  });
  await page.goto(sourceQuery());
  await expect(page.locator('#error-panel')).toContainText('may be private');
  await expect(page.locator('#landing-view')).toBeVisible();
  await expect(page.getByLabel('GitHub link', { exact: true })).toHaveValue(
    SOURCE,
  );
  await page.getByText('GitHub access', { exact: true }).click();
  await page
    .getByLabel('GitHub personal access token')
    .fill('example-test-token');
  await page.getByRole('button', { name: 'Use token', exact: true }).click();
  await page.getByRole('button', { name: 'Open video', exact: true }).click();
  await expect(page.locator('#recording-title')).toHaveText(
    metadata.title ?? '',
  );
  await expect(page.locator('#error-panel')).toBeHidden();
  await expect(page.getByLabel('GitHub link', { exact: true })).toBeHidden();
});

test('URL credentials are removed without being used', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://api.github.com/'))
      apiCalls.push(request.url());
  });
  await page.goto('?demo=1&token=example-test-token');
  await expect(page.locator('#error-panel')).toContainText('Revoke any token');
  expect(page.url()).not.toContain('example-test-token');
  expect(apiCalls).toEqual([]);
});

test('broken metadata stays visible as an error while the video remains playable', async ({
  page,
}) => {
  await mockSource(page, `${VIDEO}\n\n<!-- video-navigator\n{broken}\n-->`);
  await page.goto(sourceQuery());
  await videoReady(page);
  await expect(page.locator('#metadata-notice')).toContainText(
    'not valid JSON',
  );
  await expect(page.locator('#chapters-empty')).toBeVisible();
  await expect(page.locator('#reasoning-empty')).toBeVisible();
});

test('untrusted titles and notes render as text, never HTML or remote requests', async ({
  page,
}) => {
  const hostile =
    '<img src="https://evil.test/pixel" onerror="window.injected=true">';
  const value = {
    ...metadata,
    title: hostile,
    reasoning: [{ at: 0, title: hostile, text: `${hostile} -->` }],
  };
  const external: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('evil.test')) external.push(request.url());
  });
  await mockSource(page, markdown(value));
  await page.goto(sourceQuery());
  await videoReady(page);
  await expect(page.locator('#recording-title')).toHaveText(hostile);
  await expect(page.locator('.note-text')).toHaveText(`${hostile} -->`);
  await expect(page.locator('#workspace img')).toHaveCount(0);
  expect(external).toEqual([]);
});

test('blocked private media can use a local file without uploading it', async ({
  page,
}) => {
  await mockSource(page);
  await page.route(
    'https://github.com/user-attachments/assets/**',
    async (route) => {
      await route.fulfill({
        status: 403,
        body: 'Forbidden',
        contentType: 'text/plain',
      });
    },
  );
  await page.goto(sourceQuery());
  await expect(page.locator('#media-error')).toBeVisible();
  await page.locator('#local-video').setInputFiles(fileURLToPath(MEDIA_FILE));
  await videoReady(page);
  await expect(page.locator('#media-error')).toBeHidden();
  expect(
    await page
      .locator('video')
      .evaluate((video: HTMLVideoElement) => video.currentSrc),
  ).toMatch(/^blob:/);
  await expect(page.locator('.chapter-link')).toHaveCount(3);
  await page
    .getByRole('link', {
      name: /0:20 Check the result/,
    })
    .click();
  await expect.poll(() => currentTime(page)).toBeCloseTo(20, 1);
  await expect(page.locator('#local-status')).toContainText('not uploaded');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  expect(await page.getByLabel('Navigator link').inputValue()).not.toContain(
    'blob:',
  );
});

test('timestamps beyond the real duration are reported, not silently clamped', async ({
  page,
}) => {
  const value = {
    ...metadata,
    chapters: [
      ...metadata.chapters,
      { at: 60, title: 'Outside the recording' },
    ],
  };
  await mockSource(page, markdown(value));
  await page.goto(sourceQuery(90));
  await videoReady(page);
  await expect(page.locator('#media-error')).toContainText(
    "beyond this video's duration",
  );
  await expect(page.locator('#metadata-notice')).toContainText(
    '1 timestamp(s)',
  );
  await expect(
    page.getByRole('link', { name: /1:00 Outside the recording/ }),
  ).toHaveAttribute('aria-disabled', 'true');
  await expect.poll(() => currentTime(page)).toBeCloseTo(0, 1);
});

test('a cancelled API response cannot replace a newer recording', async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('https://api.github.com/**', async (route) => {
    await gate;
    await apiResponse(route, markdown());
  });
  await page.goto(sourceQuery());
  await expect(
    page.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('GitHub link', { exact: true })).toBeHidden();
  await expect(
    page.getByRole('link', { name: 'Make your own', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('GitHub link', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  release?.();
  await videoReady(page);
  await expect(page.locator('#recording-title')).toHaveText(
    'A recording with a little more context',
  );
  await expect(page.locator('#error-panel')).toBeHidden();
});

test('browser history restores the prior view', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await expect(page.locator('#workspace')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#landing-view')).toBeVisible();
  await expect(page.locator('#workspace')).toBeHidden();
  await page.goForward();
  await expect(page.locator('#workspace')).toBeVisible();
});

test('the landing page shows the pitch and use cases before its two setup steps', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('.setup-steps > li')).toHaveCount(2);
  await expect(page.locator('.setup-steps h2')).toHaveText([
    'Teach your agent how',
    'Open your recording',
  ]);
  await expect(page.locator('.intro + .use-cases + .setup-steps')).toHaveCount(
    1,
  );
  const [introBox, casesBox, skillBox, sourceBox] = await Promise.all([
    page.locator('.intro').boundingBox(),
    page.locator('.use-cases').boundingBox(),
    page.locator('.skill-install').boundingBox(),
    page.locator('.source-section').boundingBox(),
  ]);
  if (!introBox || !casesBox || !skillBox || !sourceBox)
    throw new Error('The pitch, use cases, and setup steps must be visible.');
  expect(introBox.y + introBox.height).toBeLessThan(casesBox.y);
  expect(casesBox.y + casesBox.height).toBeLessThan(skillBox.y);
  expect(skillBox.y + skillBox.height).toBeLessThan(sourceBox.y);
  await expect(page.locator('#landing-view img')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Try the demo', exact: true }),
  ).not.toHaveCSS('position', 'absolute');
  await expect(
    page.getByRole('link', { name: 'Make your own', exact: true }),
  ).toBeHidden();
  await expect(page.locator('.intro')).toContainText(
    'No separate account, login, or hosting service.',
  );
  await expect(
    page.getByRole('heading', { name: 'Product demos', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Proof of work', exact: true }),
  ).toBeVisible();
});

for (const [name, query] of [
  ['demo', '?demo=1'],
  ['GitHub', sourceQuery()],
] as const) {
  test(`${name} recordings have a focused player without landing-page controls`, async ({
    page,
  }) => {
    await mockSource(page);
    await page.goto(query);
    await videoReady(page);
    await expect(page.locator('#landing-view')).toBeHidden();
    await expect(page.getByLabel('GitHub link', { exact: true })).toBeHidden();
    await expect(page.locator('.skill-install')).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Try the demo', exact: true }),
    ).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('#recording-title')).toBeFocused();
    await expect(
      page
        .locator('.site-header')
        .getByRole('link', { name: 'Make your own', exact: true }),
    ).toHaveAttribute('href', './');
  });
}

test('Make your own returns to the clean home URL and Back restores the recording', async ({
  page,
}) => {
  await mockSource(page);
  await page.goto(sourceQuery(12.125));
  await videoReady(page);
  const recordingUrl = page.url();
  const homeUrl = new URL('./', recordingUrl).href;
  await page.getByRole('link', { name: 'Make your own', exact: true }).click();
  await expect(page).toHaveURL(homeUrl);
  await expect(page.locator('#landing-view')).toBeVisible();
  await expect(page.getByLabel('GitHub link', { exact: true })).toHaveValue('');
  await expect(page.locator('#workspace')).toBeHidden();
  await page.goBack();
  await expect(page).toHaveURL(recordingUrl);
  await videoReady(page);
  await expect.poll(() => currentTime(page)).toBeCloseTo(12.125, 2);
  await expect(page.getByLabel('GitHub link', { exact: true })).toBeHidden();
});

test('returning home clears the token before opening another recording', async ({
  page,
}) => {
  const authorization: (string | undefined)[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://api.github.com/')) {
      authorization.push(request.headers().authorization);
    }
  });
  await mockSource(page);
  await page.goto('./');
  await page.getByText('GitHub access', { exact: true }).click();
  await page
    .getByLabel('GitHub personal access token')
    .fill('example-test-token');
  await page.getByRole('button', { name: 'Use token', exact: true }).click();
  await page.getByLabel('GitHub link', { exact: true }).fill(SOURCE);
  await page.getByRole('button', { name: 'Open video', exact: true }).click();
  await videoReady(page);
  await page.getByRole('link', { name: 'Make your own', exact: true }).click();
  await expect(page.locator('#access-state')).toHaveText('Optional');
  await page.getByLabel('GitHub link', { exact: true }).fill(SOURCE);
  await page.getByRole('button', { name: 'Open video', exact: true }).click();
  await videoReady(page);
  expect(authorization).toEqual(['Bearer example-test-token', undefined]);
});

test('follow mode can be paused while browsing notes', async ({ page }) => {
  await page.goto('?demo=1');
  await videoReady(page);
  await page.getByLabel('Follow playback', { exact: true }).uncheck();
  await page
    .getByRole('link', {
      name: /0:30 Share the exact moment/,
    })
    .click();
  await expect(page.locator('.note.is-current')).toContainText(
    'Link to the moment under discussion',
  );
  expect(
    await page
      .locator('#reasoning-scroll')
      .evaluate((scroll) => scroll.scrollTop),
  ).toBe(0);
  await page.getByLabel('Follow playback', { exact: true }).check();
  await expect
    .poll(() =>
      page.locator('#reasoning-scroll').evaluate((scroll) => scroll.scrollTop),
    )
    .toBeGreaterThan(0);
});

test('the landing page explains the skill and copies the exact installation command', async ({
  page,
}) => {
  const command =
    'gh skill install BagToad/github-video-navigator video-navigator --agent github-copilot --scope user';
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          document.documentElement.dataset.copiedCommand = text;
        },
      },
    });
  });
  await page.goto('./');
  await expect(
    page.getByRole('heading', { name: 'Teach your agent how' }),
  ).toBeVisible();
  await expect(page.locator('.skill-install-description')).toContainText(
    'timestamped agent reasoning',
  );
  expect(
    (await page.locator('#skill-install-command').textContent())?.trim(),
  ).toBe(command);
  await page.getByRole('button', { name: 'Copy command', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-copied-command',
    command,
  );
  await expect(page.locator('#skill-install-status')).toHaveText(
    'Command copied.',
  );
  await expect(
    page.getByRole('link', { name: 'Read the skill', exact: true }),
  ).toHaveAttribute(
    'href',
    'https://github.com/BagToad/github-video-navigator/tree/main/skills/video-navigator',
  );
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await expect(page.locator('.skill-install')).toBeHidden();
  await page.goBack();
  await expect(page.locator('.skill-install')).toBeVisible();
});

test('a blocked clipboard leaves the install command available for manual copying', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException(
            'Clipboard access is blocked.',
            'NotAllowedError',
          );
        },
      },
    });
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Copy command', exact: true }).click();
  await expect(page.locator('#skill-install-status')).toHaveText(
    'Automatic copy is unavailable. Select the command and copy it manually.',
  );
  await expect(page.locator('#skill-install-command')).toBeVisible();
});

test('the warm palette follows system and manual theme choices with one shared brand mark', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(250, 249, 246)',
  );
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(43, 41, 38)');
  await expect(page.locator('#open-video')).toHaveCSS(
    'background-color',
    'rgb(43, 41, 38)',
  );
  const faviconUrl = await page
    .locator('link[rel="icon"]')
    .evaluate((link: HTMLLinkElement) => link.href);
  await expect(page.locator('.brand-mark')).toHaveCSS(
    'mask-image',
    `url("${faviconUrl}")`,
  );
  const favicon = await page.request.get(faviconUrl);
  expect(favicon.ok()).toBe(true);
  expect(await favicon.text()).toContain('<title>Video navigator</title>');
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(32, 31, 29)',
  );
  await expect(page.locator('#open-video')).toHaveCSS(
    'background-color',
    'rgb(238, 233, 225)',
  );
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });

  await page.getByRole('button', { name: /^Theme: system/ }).click();
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(250, 249, 246)',
  );
  await page.getByRole('button', { name: /^Theme: light/ }).click();
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(32, 31, 29)',
  );
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(238, 233, 225)');
  await expect(page.locator('#open-video')).toHaveCSS(
    'background-color',
    'rgb(238, 233, 225)',
  );
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(32, 31, 29)',
  );
  await page.getByRole('button', { name: /^Theme: dark/ }).click();
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(250, 249, 246)',
  );

  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await videoReady(page);
  for (const [mode, background, accent] of [
    ['light', 'rgb(241, 238, 232)', 'rgb(151, 72, 47)'],
    ['dark', 'rgb(41, 39, 36)', 'rgb(216, 149, 117)'],
  ] as const) {
    await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
    await expect(page.locator('.note.is-current')).toHaveCSS(
      'background-color',
      background,
    );
    await expect(page.locator('.note.is-current .note-time')).toHaveCSS(
      'color',
      accent,
    );
    await expect(page.locator('.chapter-link[aria-current="true"]')).toHaveCSS(
      'background-color',
      background,
    );
    expect(
      await page
        .locator('.note.is-current')
        .evaluate((note) => getComputedStyle(note).boxShadow),
    ).toContain(accent);
  }
});

test('error and access controls remain readable in both warm themes', async ({
  page,
}) => {
  await page.route('https://api.github.com/**', async (route) => {
    await route.fulfill({ status: 404, json: { message: 'Not Found' } });
  });
  await page.goto(sourceQuery());
  await expect(page.locator('#error-panel')).toBeVisible();
  await page.getByText('GitHub access', { exact: true }).click();
  for (const mode of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  }
});

test('keyboard navigation, dialogs, responsive layout, and both themes remain accessible', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('./');
  for (const mode of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode });
    const landingResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(landingResults.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page
    .getByRole('button', { name: 'Metadata guide', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  let results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await videoReady(page);
  for (const mode of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode });
    results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  }
  await page.locator('.chapter-link').nth(2).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => currentTime(page)).toBeCloseTo(20, 1);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.locator('#share-status')).toHaveText(
    /Link copied|Automatic copy is unavailable/,
  );
});
