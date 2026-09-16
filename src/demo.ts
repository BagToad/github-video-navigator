import { parseDocument } from './metadata';
import type { VideoSource } from './github';
import type { VideoMetadata } from './schema';
import { SCHEMA_URL } from './urls';

export const DEMO_VIDEO =
  'https://raw.githubusercontent.com/BagToad/github-video-navigator/main/public/demo/walkthrough.mp4';

export const demoMetadata: VideoMetadata = {
  $schema: SCHEMA_URL,
  version: 1,
  video: DEMO_VIDEO,
  title: 'A recording with a little more context',
  chapters: [
    {
      at: 0,
      title: 'Start with the recording',
      description: 'One GitHub link brings the video and its context together.',
    },
    {
      at: 10,
      title: 'Give the video chapters',
      description: 'Useful moments become places you can jump to.',
    },
    {
      at: 20,
      title: 'Follow the decisions',
      description: 'Recorded notes tell you what happened and why.',
    },
    {
      at: 30,
      title: 'Share the exact moment',
      description: 'Send a link that opens where the conversation starts.',
    },
  ],
  reasoning: [
    {
      at: 0,
      kind: 'observation',
      title: 'The recording is only part of the story',
      text: 'A video shows what happened. Chapters and recorded notes make the important moments easier to find.',
    },
    {
      at: 5,
      kind: 'decision',
      title: 'Keep the context beside the work',
      text: 'The video and its metadata live in the same GitHub body. There is no separate service to keep in sync.',
    },
    {
      at: 10,
      kind: 'action',
      title: 'Mark useful changes of context',
      text: 'A chapter starts at a timestamp in seconds. Select any chapter to move the video directly to it.',
    },
    {
      at: 16,
      kind: 'result',
      title: 'Seeking works in both directions',
      text: 'Jumping backward restores the earlier chapter and notes. Nothing depends on watching from the beginning.',
    },
    {
      at: 20,
      kind: 'observation',
      title: 'Notes are not a transcript',
      text: 'Record concise observations, decisions, actions, and results. They provide context that the audio may not contain.',
    },
    {
      at: 25,
      kind: 'decision',
      title: 'Leave room to read',
      text: 'Turn off Follow playback to browse the notes at your own pace. Turn it back on to return to the current moment.',
    },
    {
      at: 30,
      kind: 'action',
      title: 'Link to the moment under discussion',
      text: 'Share includes the GitHub source, the selected video, and an optional start time. It never includes an access token.',
    },
    {
      at: 36,
      kind: 'result',
      title: 'Ready for another set of eyes',
      text: 'Anyone with access to the source can open the link and explore the same chapters and notes in their browser.',
    },
  ],
};

export const exampleMarkdown = `${DEMO_VIDEO}

<!-- video-navigator
${JSON.stringify(demoMetadata, null, 2)}
-->`;

export function demoSource(): VideoSource {
  return {
    ...parseDocument(exampleMarkdown),
    url: '',
    title: 'Video navigator walkthrough',
    author: '',
    label: 'Built-in walkthrough',
  };
}
