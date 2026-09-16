---
name: video-navigator
description: Upload recordings with gh --attach and add chapters, timestamped agent notes, and Video navigator links to issue bodies, pull request bodies, conversation comments, inline review comments, and review summaries. Use when publishing or annotating a GitHub-hosted video walkthrough.
---

# Video navigator

Publish a GitHub-hosted recording with hidden version 1 metadata and a link to
<https://bagtoad.github.io/github-video-navigator/>.

## Use gh for GitHub operations

Use the authenticated **`gh` CLI**, especially **`--attach` for video uploads**.
Prefer `gh` over browser automation, custom upload endpoints, hand-built HTTP
authentication, or third-party hosting. Load the `gh` skill when available.

Check `gh --version` and the chosen command's `--help` for `--attach`. If the flag
is missing, check which binary is running and other installed versions before
proposing an installation or upgrade.

Use `gh api` when a higher-level command does not expose the exact resource.
Never print authentication tokens or put them in Markdown, metadata, commands
that expose them in process arguments, or share links.

## Complete the whole workflow

A new upload needs two writes: **upload the video, then finish the same body
with metadata and a navigator link**. The final attachment URL is not known
before upload. `gh ... --attach` alone does not complete an annotated recording.

1. Prepare `upload.md` and `metadata.json` locally. Review the prose, chapters,
   and notes together. Unresolved URLs belong only in the local metadata draft.
2. Upload once using the chosen destination example below.
3. Read the stored body into `uploaded.md`. Capture its actual video URL and the
   exact issue, pull request, comment, or review permalink.
4. Build and review `final.md`, including the resolved metadata and navigator link.
5. Update that same body without `--attach`, then verify the stored result and playback.

**An upload-only body file is an intermediate artifact, not a finished handoff.**
If a person must run the upload, label that stage as incomplete and provide the
metadata draft and the remaining assembly, update, and verification steps too.
Never claim completion while the stored body lacks valid metadata.

## Prepare the recording

Establish the target repository, issue or pull request, local video path, and
whether to add a comment or edit a specific existing body. Prefer a dedicated
conversation comment when no existing body was specified.

If the video is already attached, reuse its URL and skip the upload. Replace an
existing matching metadata block and navigator link instead of appending
duplicates.

Inspect the recording's duration and relevant moments. Use `ffprobe` when
available:

```sh
ffprobe -v error -show_entries format=duration -of json recording.mp4
```

Use H.264 MP4 for broad browser support. MOV and WebM are also supported, subject
to browser codec support. Keep original timing when converting a recording.

Prepare the metadata before uploading. Write a short chapter outline and
concise, evidence-based notes describing observable actions, decisions, and
results. They are not a transcript or a place for private internal deliberation.
Do not invent timestamps, outcomes, or reasoning that was not recorded or provided.

Keep drafts local until approved. Before every upload or edit, review the video,
prose, and metadata for credentials, personal data, and material that does not
belong in the destination repository. Never disclose private work in a public
repository.

## Choose the destination

Inspect the destination before publishing. Read its full body and relevant
comments with `gh issue view`, `gh pr view`, or paginated `gh api` calls. Preserve
existing content when editing. For a new issue or pull request, preserve any
applicable repository template in `upload.md`.

Substitute uppercase placeholders with the actual repository, IDs, URLs, and
approved branch names. Quote URLs, especially those containing `#` or query
parameters. The examples are alternatives, not commands to run together.
`assemble.mjs` is the shared body builder shown below.

Uploads are not atomic. An issue, pull request, or comment may be created even
when some attachments fail. Inspect the returned URL and body before retrying.
Never guess an attachment URL from a filename or assume `--attach` rewrites
a URL inside a JSON string.

### Issue body

Create a new issue only when requested:

```sh
gh issue create --repo OWNER/REPO --title "Recording walkthrough" --body-file upload.md --attach recording.mp4
```

Or append the video to an existing issue, preserving its current body:

```sh
gh issue edit ISSUE_NUMBER --repo OWNER/REPO --attach recording.mp4
```

Read and finish the **issue body**, using the new issue number returned by
`create` or the existing number. Review and validate the assembled files before
the final edit:

```sh
gh api repos/OWNER/REPO/issues/ISSUE_NUMBER --jq .body > uploaded.md
node assemble.mjs 'https://github.com/OWNER/REPO/issues/ISSUE_NUMBER' 'VIDEO_URL'
gh issue edit ISSUE_NUMBER --repo OWNER/REPO --body-file final.md
```

### Pull request body

For a requested new pull request, use the approved base and an already-pushed
head branch:

```sh
gh pr create --repo OWNER/REPO --base BASE_BRANCH --head HEAD_BRANCH --title "Recording walkthrough" --body-file upload.md --attach recording.mp4
```

Or append the video to an existing pull request description:

```sh
gh pr edit PR_NUMBER --repo OWNER/REPO --attach recording.mp4
```

Read and finish the **pull request body**, not a conversation comment. The REST
update changes only the supplied body field:

```sh
gh api repos/OWNER/REPO/pulls/PR_NUMBER --jq .body > uploaded.md
node assemble.mjs 'https://github.com/OWNER/REPO/pull/PR_NUMBER' 'VIDEO_URL'
gh api --method PATCH repos/OWNER/REPO/pulls/PR_NUMBER --input final-body.json
```

### Issue conversation comment

Capture the exact comment permalink printed by the upload command. Use its
`#issuecomment-COMMENT_ID` anchor, not an assumed last comment:

```sh
gh issue comment ISSUE_NUMBER --repo OWNER/REPO --body-file upload.md --attach recording.mp4
gh api repos/OWNER/REPO/issues/comments/COMMENT_ID --jq .body > uploaded.md
node assemble.mjs 'https://github.com/OWNER/REPO/issues/ISSUE_NUMBER#issuecomment-COMMENT_ID' 'VIDEO_URL'
gh api --method PATCH repos/OWNER/REPO/issues/comments/COMMENT_ID --input final-body.json
```

### Pull request conversation comment

Pull request conversation comments use the same REST comment endpoints as
issue comments, but their permalinks use `/pull/`:

```sh
gh pr comment PR_NUMBER --repo OWNER/REPO --body-file upload.md --attach recording.mp4
gh api repos/OWNER/REPO/issues/comments/COMMENT_ID --jq .body > uploaded.md
node assemble.mjs 'https://github.com/OWNER/REPO/pull/PR_NUMBER#issuecomment-COMMENT_ID' 'VIDEO_URL'
gh api --method PATCH repos/OWNER/REPO/issues/comments/COMMENT_ID --input final-body.json
```

### Inline pull request review comment

Use the existing comment's `#discussion_rCOMMENT_ID` permalink. Links ending in
`/files#rCOMMENT_ID` are also accepted by the navigator.

There is no `--attach` flag on `gh api` or `gh pr review`. Reuse an already-uploaded
video. If an upload is needed, first obtain approval for an appropriate body or
conversation-comment destination and use `--attach` there. Do not create an
unrequested placeholder comment just to host a file.

Read the target below, then add the approved video URL to `uploaded.md` if it is
not already visible in that body. Assemble and update the existing comment:

```sh
gh api repos/OWNER/REPO/pulls/comments/COMMENT_ID --jq .body > uploaded.md
node assemble.mjs 'https://github.com/OWNER/REPO/pull/PR_NUMBER#discussion_rCOMMENT_ID' 'VIDEO_URL'
gh api --method PATCH repos/OWNER/REPO/pulls/comments/COMMENT_ID --input final-body.json
```

### Pull request review summary body

Use the existing review's `#pullrequestreview-REVIEW_ID` permalink. Reuse an
uploaded video as above, adding its URL to the local body before assembly if
needed. Updating a review summary uses **PUT**, not PATCH:

```sh
gh api repos/OWNER/REPO/pulls/PR_NUMBER/reviews/REVIEW_ID --jq .body > uploaded.md
node assemble.mjs 'https://github.com/OWNER/REPO/pull/PR_NUMBER#pullrequestreview-REVIEW_ID' 'VIDEO_URL'
gh api --method PUT repos/OWNER/REPO/pulls/PR_NUMBER/reviews/REVIEW_ID --input final-body.json
```

These edits change existing text. Do not submit another review, change approval
state, dismiss a review, resolve a thread, or publish a reply while annotating
an existing body.

## Build the metadata

Use the [version 1 schema](https://bagtoad.github.io/github-video-navigator/schema/v1.json).
The local copy is `public/schema/v1.json` in this repository.

```json
{
  "$schema": "https://bagtoad.github.io/github-video-navigator/schema/v1.json",
  "version": 1,
  "video": "https://github.com/user-attachments/assets/11111111-1111-4111-8111-111111111111",
  "title": "Reviewing a loader change",
  "chapters": [
    { "at": 0, "title": "Check the starting behavior" },
    { "at": 8.25, "title": "Review the result" }
  ],
  "reasoning": [
    {
      "at": 1.5,
      "kind": "observation",
      "title": "The empty state is visible",
      "text": "The recording begins with no source selected."
    },
    {
      "at": 9,
      "kind": "result",
      "text": "The selected recording is visible with its chapter list."
    }
  ]
}
```

Save the authoring draft as `metadata.json`. Replace all example content with
the actual recording. Resolve `video` to the URL obtained from the stored body
after upload; the body builder below supplies that value.

- `video` must match a visible video URL in the same Markdown body.
- `version`, `video`, `chapters`, and `reasoning` are required. Arrays may be empty.
- `at` is a finite number of seconds from the start, including fractional seconds.
  Keep timestamps within the real duration and the schema's seven-day limit.
- Chapters have `at`, `title`, and optional `description`. Their timestamps
  increase strictly.
- Notes have `at`, `text`, and optional `title`, `kind`, and `agent`.
  Allowed kinds are `observation`, `decision`, `action`, and `result`.
- Notes are in nondecreasing timestamp order. Equal timestamps form a group
  that remains current until the next timestamp.
- Use plain text. Maximum lengths are 180 characters for titles, 500 for
  descriptions, 10,000 for note text, and 80 for agent labels.
- Use one block per video, at most 500 chapters and 2,000 notes per block.

Validate the resolved metadata against the version 1 schema before publishing,
including timestamp order and bounds against the recording's actual duration.
Metadata embedded inside the video file is not read by version 1.

## Assemble the final body and link

The navigator's `url` parameter is the **source permalink**, not the attachment
URL. Use the plain issue or pull request URL for a body; use the exact anchored
permalink for a comment or review. `URLSearchParams` preserves those anchors by
encoding them inside `url`.

Save this Node.js example as `assemble.mjs` alongside `metadata.json` and the
freshly fetched `uploaded.md`. It writes both the Markdown file used by
`gh issue edit` and the JSON request used by `gh api`. Run it with the source
permalink and actual video URL, as shown in each destination example.

This append-only example requires a body with no existing metadata blocks.
For an already-annotated body, add or replace only the target video's block and
navigator link, preserving metadata for other videos. Assembly is not schema
validation; validate the resolved metadata before the final update.

```javascript
import { readFile, writeFile } from 'node:fs/promises';

const [sourceUrl, videoUrl] = process.argv.slice(2);
if (!sourceUrl || !videoUrl) {
  throw new Error('Usage: node assemble.mjs SOURCE_URL VIDEO_URL');
}

const source = new URL(sourceUrl);
if (
  source.origin !== 'https://github.com' ||
  source.username ||
  source.password ||
  source.search
) {
  throw new Error(
    'Use a GitHub source permalink without credentials or query parameters.',
  );
}

const uploadedBody = await readFile('uploaded.md', 'utf8');
if (!uploadedBody.includes(videoUrl)) {
  throw new Error('The uploaded body does not contain the supplied video URL.');
}
if (/<!--\s*video-navigator(?:\s|$)/.test(uploadedBody)) {
  throw new Error(
    'Existing metadata found. Replace the matching block instead of appending.',
  );
}

const metadata = JSON.parse(await readFile('metadata.json', 'utf8'));
metadata.video = videoUrl;
const json = JSON.stringify(metadata, null, 2)
  .replaceAll('<', '\\u003c')
  .replaceAll('>', '\\u003e');
const block = `<!-- video-navigator\n${json}\n-->`;
const link = new URL('https://bagtoad.github.io/github-video-navigator/');
link.searchParams.set('url', source.href);
const markdownLink = `[Open chapters and agent notes](${link.href})`;
const body = `${uploadedBody.trimEnd()}\n\n${markdownLink}\n\n${block}\n`;

await writeFile('metadata.json', `${JSON.stringify(metadata, null, 2)}\n`);
await writeFile('final.md', body);
await writeFile('final-body.json', `${JSON.stringify({ body })}\n`);
```

For a timestamped link, add `link.searchParams.set('t', '8.25')` before building
`markdownLink`. Omit `t` to start at the beginning. For multiple videos in the same
body, set `video=2` for the second distinct visible video, using a 1-based index.
Neither a local file path nor an attachment URL belongs in the `url` parameter.

Review the complete `final.md` locally. Keep the video outside the HTML comment
so GitHub renders its normal player, with the navigator link beside it and
hidden JSON below it. The metadata's `video` must match a visible video in that
body. Do not publish example values or unresolved placeholders.

Immediately before the destination's final update command, re-read its body.
If it changed since capture, merge the changes and review again rather than
overwriting them.

Do not use `--edit-last`, which can target the wrong comment. Do not repeat
`--attach` for a metadata-only update. Use only the final update command matching
the chosen body or comment type.

## Verify the result

Fetch the exact stored body again with `gh api`. Confirm the attachment URL, one
valid hidden block for that video, preserved existing text, and a navigator link
targeting that same body. The video, link, and metadata must not be split across
an issue description and a comment.
Open that link and check playback, at least one chapter jump, a backward seek,
and a note transition. Only then report the annotated recording as complete.

For private sources, viewers need their own GitHub access. The navigator's
optional token stays in page memory and authenticates API requests only. It
cannot bypass video-host download limits or browser cookie restrictions. If
remote playback is blocked, select a downloaded copy of the same recording in
the navigator; the local file is not uploaded.
