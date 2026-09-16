---
name: video-navigator
description: Upload recordings to GitHub with gh --attach, add clickable chapters and timestamped agent notes, and build Video navigator links. Use when sharing a video walkthrough, annotating a recording, or attaching a chaptered video to an issue, pull request, or comment.
---

# Video navigator

Publish a GitHub-hosted recording with hidden version 1 metadata and a link to
<https://bagtoad.github.io/github-video-navigator/>.

## Use gh for GitHub operations

Use the authenticated **`gh` CLI**, especially **`--attach` for video uploads**.
Prefer `gh` over browser automation, custom upload endpoints, hand-built HTTP
authentication, or third-party hosting. Load the `gh` skill when available.

Use `gh api` when a higher-level command does not expose the exact resource.
Never print authentication tokens or put them in Markdown, metadata, commands
that expose them in process arguments, or share links.

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

Write a short chapter outline and concise, evidence-based notes. Notes describe
observable actions, decisions, and results; they are not a transcript or a place
for private internal deliberation. Do not invent timestamps, outcomes, or
reasoning that was not recorded or provided.

Keep drafts local until approved. Before every upload or edit, review the video,
prose, and metadata for credentials, personal data, and material that does not
belong in the destination repository. Never disclose private work in a public
repository.

## Upload with --attach

Inspect the destination before publishing. Read its full body and relevant
comments with `gh issue view`, `gh pr view`, or paginated `gh api` calls. Preserve
existing content when editing.

For an issue conversation:

```sh
gh issue view 123 --repo OWNER/REPO --json body,comments,url
gh issue comment 123 --repo OWNER/REPO --body-file draft.md --attach recording.mp4
```

For a pull request conversation:

```sh
gh pr view 123 --repo OWNER/REPO --json body,comments,url
gh pr comment 123 --repo OWNER/REPO --body-file draft.md --attach recording.mp4
```

These are alternatives, not commands to run together. Use the approved target
and actual file paths. `--attach` uploads the video and adds its GitHub URL to the
body. Uploads are not atomic: if a command fails, inspect the result before
retrying so an already-uploaded attachment is not duplicated.

Capture the returned **exact comment permalink**. Extract its comment ID and
fetch the stored body:

```sh
gh api repos/OWNER/REPO/issues/comments/COMMENT_ID --jq .body
```

Issue and pull request conversation comments use this same endpoint. Use the
actual uploaded URL from that body. Never guess an attachment URL from a local
filename, and never assume `--attach` rewrites a URL inside a JSON string.

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

Replace all example content with the actual recording and uploaded URL.

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

Serialize with `JSON.stringify`, then escape literal `<` and `>` as `\u003c`
and `\u003e` to prevent text from opening or closing an HTML comment:

```javascript
const json = JSON.stringify(metadata, null, 2)
  .replaceAll('<', '\\u003c')
  .replaceAll('>', '\\u003e');
const block = `<!-- video-navigator\n${json}\n-->`;
```

Append the block below the uploaded video in the same body. Keep the video
outside the comment so GitHub still renders its normal player. Metadata embedded
inside the video file is not read by version 1.

## Add the navigator link

Build the link from the **GitHub comment permalink**, not the attachment URL.
Use `URLSearchParams` so the comment's `#` is encoded as part of `url`:

```javascript
const link = new URL('https://bagtoad.github.io/github-video-navigator/');
link.searchParams.set('url', commentUrl);
link.searchParams.set('t', '8.25');
const markdownLink = `[Open chapters and agent notes](${link.href})`;
```

Omit `t` to start at the beginning. For multiple videos in the same body, add
`video=2` for the second visible video, using a 1-based index. A dedicated comment
with one video usually needs only `url`.

Place the navigator link beside the video and keep the hidden JSON below it.
Serialize the complete final body as a local JSON request file:

```javascript
const body = `${uploadedBody.trimEnd()}\n\n${markdownLink}\n\n${block}\n`;
const request = JSON.stringify({ body });
```

Review the final Markdown locally. Re-read the exact comment before editing; if
it changed, merge the new content and review again. Apply the approved body by
comment ID:

```sh
gh api --method PATCH repos/OWNER/REPO/issues/comments/COMMENT_ID --input final-comment.json
```

Do not use `--edit-last`, which can target the wrong comment. Do not repeat
`--attach` for a metadata-only update. For an inline review comment, the exact
endpoint is `repos/OWNER/REPO/pulls/comments/COMMENT_ID` instead.

## Verify the result

Fetch the stored body again with `gh api`. Confirm the attachment URL, one valid
hidden block, preserved existing text, and a correctly encoded navigator link.
Open that link and check playback, at least one chapter jump, a backward seek,
and a note transition.

For private sources, viewers need their own GitHub access. The navigator's
optional token stays in page memory and authenticates API requests only. It
cannot bypass video-host download limits or browser cookie restrictions. If
remote playback is blocked, select a downloaded copy of the same recording in
the navigator; the local file is not uploaded.
