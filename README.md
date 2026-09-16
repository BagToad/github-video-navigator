# Video navigator

Add clickable chapters and synchronized agent notes to the GitHub issues, pull
requests, and comments you already use. Video navigator enhances those
conversations instead of replacing them.

GitHub hosts the video, and its metadata stays hidden in the same Markdown body,
close to the work. Everything runs in the browser on GitHub Pages, with no
separate account, login, or hosting service. Private recordings use your existing
GitHub access.

Use it for product demos that reviewers can explore by chapter, or proof of work
that keeps a recording of changes, decisions, and results beside the issue or PR.

**[Open Video navigator](https://bagtoad.github.io/github-video-navigator/)** |
**[Try the demo](https://bagtoad.github.io/github-video-navigator/?demo=1)** |
**[Metadata schema](https://bagtoad.github.io/github-video-navigator/schema/v1.json)**

## Create videos with an agent

> [!TIP]
> Install the authoring skill to publish GitHub-hosted videos with chapters and
> timestamped agent reasoning.

```sh
gh skill install BagToad/github-video-navigator video-navigator --agent github-copilot --scope user
```

The [video-navigator skill](skills/video-navigator/SKILL.md) uses `gh` with
`--attach` and includes issue-body, pull-request-body, conversation-comment, and
review examples. It covers the complete upload, metadata, and navigator-link
workflow. Choose another supported agent with `--agent`.

## Open a recording

Paste a GitHub.com issue, pull request, or comment URL into the second step on the
home page. Opening a recording shows a dedicated player without the setup form.
Use **Make your own** in the player header to return home. Installing the skill
is not required to watch an existing recording.

Supported comment links include conversation comments (`#issuecomment-123`),
inline review comments
(`#discussion_r123` or `/files#r123`), and review bodies (`#pullrequestreview-123`).

For a link without a comment anchor, the navigator checks the body first, then
conversation comments, inline review comments, and review bodies. It opens the
first body containing a supported video. Use a comment permalink to select a
different comment. When a body contains multiple videos, a recording selector
appears.

Supported media includes GitHub attachment URLs, legacy repository asset URLs,
and MP4, MOV, or WebM files hosted on `user-images.githubusercontent.com`,
`private-user-images.githubusercontent.com`, or `raw.githubusercontent.com`.
Playback depends on browser codec support; H.264 MP4 provides broad compatibility.
External video hosts and GitHub Enterprise hosts are not supported.

## Add chapters and notes

Put the video URL and a `video-navigator` HTML comment in the **same Markdown
body**. GitHub hides the HTML comment from the rendered conversation.

```markdown
https://github.com/user-attachments/assets/11111111-1111-4111-8111-111111111111

<!-- video-navigator
{
  "$schema": "https://bagtoad.github.io/github-video-navigator/schema/v1.json",
  "version": 1,
  "video": "https://github.com/user-attachments/assets/11111111-1111-4111-8111-111111111111",
  "title": "Reviewing the video loader",
  "chapters": [
    { "at": 0, "title": "Read the source" },
    {
      "at": 10,
      "title": "Load the recording",
      "description": "Start playback and check the timeline."
    }
  ],
  "reasoning": [
    {
      "at": 2.5,
      "kind": "observation",
      "title": "The source has one recording",
      "text": "The attachment and its metadata are in the same comment.",
      "agent": "Reviewer"
    },
    {
      "at": 12,
      "kind": "decision",
      "text": "Keep playback paused while reviewing this result."
    }
  ]
}
-->
```

Replace the example attachment URL with the actual uploaded video URL in both
places. Give each video exactly one metadata block. Metadata does not create a
video by itself: its URL must also be present in the visible Markdown as a bare
URL, a link, or a video/source element.

### Version 1 contract

| Field       | Required | Meaning                                                              |
| ----------- | -------- | -------------------------------------------------------------------- |
| `version`   | Yes      | Exactly `1`.                                                         |
| `video`     | Yes      | The matching HTTPS GitHub video URL.                                 |
| `chapters`  | Yes      | Ordered `{ at, title, description? }` entries; may be empty.         |
| `reasoning` | Yes      | Ordered `{ at, text, kind?, title?, agent? }` entries; may be empty. |
| `title`     | No       | Recording title.                                                     |
| `$schema`   | No       | The version 1 schema URL shown above.                                |

Timestamps are seconds from the beginning, including fractional seconds, from
`0` through `604800`. Chapters must be in strictly increasing order. Notes must
be in nondecreasing order; notes with the same timestamp form a group. The current
group remains active until the next timestamp, including after backward seeks.
Before the first note, no note is current.

The optional `kind` is `observation`, `decision`, `action`, or `result`. The default
display label is `decision`. Titles are limited to 180 characters, descriptions to
500, note text to 10,000, and agent labels to 80. Text must not be blank.

All metadata text is rendered as plain text. When generating JSON, escape literal
`<` and `>` characters as `\u003c` and `\u003e` so strings cannot open or close an
HTML comment. Do not include credentials or sensitive material that does not
belong in the source repository.

A metadata block supports up to 500 chapters and 2,000 notes. A Markdown body
supports up to 100 videos, 100 metadata blocks, and 1 MB of text. Conversation
discovery scans up to 1,000 entries in each comment collection and reports the
limit rather than silently stopping. Larger conversations need a direct
comment link.

Invalid metadata produces a visible notice without preventing video playback.
Duplicate blocks disable metadata for their matching video. Timestamps beyond
the loaded video's duration are marked unavailable.

The JSON Schema is generated from the runtime Zod schema by `npm run schema`.
Timestamp ordering and matching the visible video are additional application
checks. Version 1 reads metadata from Markdown, not embedded video-file tags.

## Share a moment

The **Share** button copies a link with the source, selected recording, and an
optional start time. A local video selection is not included.

| Parameter | Meaning                                                       |
| --------- | ------------------------------------------------------------- |
| `url`     | URL-encoded GitHub issue, pull request, or comment permalink. |
| `t`       | Optional start time in seconds, including fractional seconds. |
| `video`   | Optional 1-based video index within the linked Markdown body. |
| `demo=1`  | Opens the built-in walkthrough instead of a GitHub source.    |

Build links with `URLSearchParams` so comment anchors are encoded correctly:

```typescript
const navigator = new URL('https://bagtoad.github.io/github-video-navigator/');
navigator.searchParams.set(
  'url',
  'https://github.com/OWNER/REPO/pull/123#issuecomment-456',
);
navigator.searchParams.set('t', '12.5');
```

Place a normal Markdown link beside the original video:

```markdown
[Open chapters and agent notes](NAVIGATOR_URL)
```

## Authentication and privacy

Public API requests work without a token, subject to GitHub's anonymous API
limits. The optional **GitHub access** field accepts a token for public or private
requests. Fine-grained tokens need repository access and read permissions for
Issues and Pull requests. Organization SSO or other organization policies may
also require authorization.

- Tokens exist only in page memory. They are not saved to cookies, local storage,
  session storage, URLs, or application logs.
- Tokens are sent only as an `Authorization` header to `https://api.github.com`.
  API requests omit cookies, disable caching, and reject redirects.
- Clear the token, reload, close the tab, or navigate away to remove it.
  A token is never included in a share link.
- Video requests use the browser's native media loader. The API token is not
  sent to `github.com` or storage hosts and cannot bypass media-host download
  limits. Browser cookie restrictions can prevent private video playback.
- If playback is blocked, open the original on GitHub, download it, and use
  **Select local video**. The local file is not uploaded; the chapters and notes
  continue to work. Select the same recording to keep timestamps accurate.

There is no backend, analytics, third-party proxy, or externally loaded script.
Fonts and libraries are served with the site. Source links and timestamps appear
in the page URL and may be retained in browser history or normal GitHub Pages
request logs. The page suppresses referrers on outgoing requests.

## Development

Use Node.js 24 or later.

```sh
npm ci
npm run dev
```

```sh
npm run check
npx playwright install chromium webkit
npm run test:browser
```

`npm run check` verifies formatting, runs the unit tests, type-checks the project,
and creates the production build. Browser tests run that build under a project
subpath in Chromium, WebKit, and a mobile viewport. They cover real playback,
seeking, source routing, authentication boundaries, local-file playback,
accessibility, and light/dark layouts.

```sh
npm run build
npm run preview
```

The original 40-second demo is bundled with the site. Regenerate the MP4, poster,
and captions with `npm run demo:generate`. This requires FFmpeg and the Playwright
Chromium browser. The generator reads the shared palette from `src/theme.css` and
the brand mark from `public/favicon.svg`, which also supplies the header logo.

## Deployment

Set the repository's GitHub Pages source to **GitHub Actions**. The
`Check and deploy` workflow validates every pull request and deploys successful
builds from `main`. The deployment job uses the `github-pages` environment and
requires `pages: write` and `id-token: write`.

Production assets use relative paths, so the application works under the
repository's GitHub Pages subpath without a routing fallback.
