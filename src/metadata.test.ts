import { describe, expect, it } from 'vitest';
import { demoMetadata, exampleMarkdown } from './demo';
import { parseDocument } from './metadata';
import { metadataSchema } from './schema';

const video =
  'https://github.com/user-attachments/assets/11111111-1111-4111-8111-111111111111';
const second =
  'https://github.com/user-attachments/assets/22222222-2222-4222-8222-222222222222';
const metadata = { ...demoMetadata, video };
const block = (value: unknown) =>
  `<!-- video-navigator\n${JSON.stringify(value)}\n-->`;

describe('video discovery', () => {
  it.each([
    video,
    `[Recording](${video})`,
    `<${video}>`,
    `<video src="${video}" controls></video>`,
    `<video controls><source src='${video}' type='video/mp4'></video>`,
    `<video src=${video}></video>`,
    `A recording: ${video}`,
    `> ${video}`,
  ])('finds supported visible markup: %s', (markup) => {
    expect(
      parseDocument(markup).recordings.map((recording) => recording.video),
    ).toEqual([video]);
  });
  it('ignores images, inline code, fenced code, and unrelated HTML comments', () => {
    const markdown = `![Image](${video})\n\n\`${video}\`\n\n\`\`\`md\n${video}\n${block(metadata)}\n\`\`\`\n\n<!-- ${video} -->`;
    expect(parseDocument(markdown)).toEqual({ recordings: [], warnings: [] });
  });
  it('ignores inert HTML examples and data attributes', () => {
    const markdown = `<script>const example = '<video src="${video}">';</script>\n\n<pre><video src="${video}"></pre>\n\n<video data-src="${video}"></video>`;
    expect(parseDocument(markdown)).toEqual({ recordings: [], warnings: [] });
  });
  it('deduplicates the same video and preserves source order', () => {
    expect(
      parseDocument(`${video}\n\n${second}\n\n${video}`).recordings.map(
        (item) => [item.index, item.video],
      ),
    ).toEqual([
      [1, video],
      [2, second],
    ]);
  });
  it('does not accept an external URL from visible Markdown or metadata', () => {
    const parsed = parseDocument(
      `https://evil.test/demo.mp4\n\n${block({ ...metadata, video: 'https://evil.test/demo.mp4' })}`,
    );
    expect(parsed.recordings).toHaveLength(0);
    expect(parsed.warnings).toHaveLength(1);
  });
});

describe('hidden metadata', () => {
  it('binds metadata to its exact visible video', () => {
    const parsed = parseDocument(
      `${video}\n\n${second}\n\n${block({ ...metadata, video: second })}`,
    );
    expect(parsed.recordings[0]?.metadata).toBeUndefined();
    expect(parsed.recordings[1]?.metadata?.chapters).toHaveLength(4);
    expect(parsed.warnings).toEqual([]);
  });
  it('does not invent a visible video from hidden metadata', () => {
    const parsed = parseDocument(block(metadata));
    expect(parsed.recordings).toEqual([]);
    expect(parsed.warnings[0]).toContain('visible Markdown');
  });
  it('leaves the video usable when metadata is malformed', () => {
    const parsed = parseDocument(
      `${video}\n\n<!-- video-navigator\n{broken json}\n-->`,
    );
    expect(parsed.recordings).toHaveLength(1);
    expect(parsed.recordings[0]?.metadata).toBeUndefined();
    expect(parsed.warnings[0]).toContain('not valid JSON');
  });
  it('reports an unclosed metadata block', () => {
    const parsed = parseDocument(`${video}\n\n<!-- video-navigator\n{`);
    expect(parsed.warnings[0]).toContain('closing -->');
  });
  it('rejects ambiguous duplicate metadata rather than choosing one', () => {
    const parsed = parseDocument(
      `${video}\n\n${block(metadata)}\n\n${block(metadata)}`,
    );
    expect(parsed.recordings[0]?.metadata).toBeUndefined();
    expect(parsed.recordings[0]?.warnings[0]).toContain(
      'Multiple metadata blocks',
    );
  });
  it('keeps HTML-like notes as plain strings when safely JSON-escaped', () => {
    const value = {
      ...metadata,
      reasoning: [{ at: 0, text: '<img src=x onerror=alert(1)> and -->' }],
    };
    const escaped = JSON.stringify(value)
      .replaceAll('<', '\\u003c')
      .replaceAll('>', '\\u003e');
    const parsed = parseDocument(
      `${video}\n\n<!-- video-navigator\n${escaped}\n-->`,
    );
    expect(parsed.recordings[0]?.metadata?.reasoning[0]?.text).toBe(
      value.reasoning[0]?.text,
    );
  });
  it('uses the real parser and schema for the built-in demo', () => {
    const parsed = parseDocument(exampleMarkdown);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.recordings).toHaveLength(1);
    expect(parsed.recordings[0]?.metadata).toEqual(demoMetadata);
  });
  it('preserves literal script examples inside a metadata note', () => {
    const value = {
      ...metadata,
      reasoning: [
        { at: 0, text: '<script>an example, not executable code</script>' },
      ],
    };
    const parsed = parseDocument(`${video}\n\n${block(value)}`);
    expect(parsed.recordings[0]?.metadata?.reasoning[0]?.text).toBe(
      value.reasoning[0]?.text,
    );
  });
});

describe('schema contract', () => {
  it.each([
    { ...metadata, version: 2 },
    { ...metadata, extra: 'unsupported' },
    { ...metadata, chapters: [{ at: -1, title: 'Invalid' }] },
    { ...metadata, chapters: [{ at: 1, title: '' }] },
    {
      ...metadata,
      chapters: [
        { at: 10, title: 'First' },
        { at: 5, title: 'Earlier' },
      ],
    },
    {
      ...metadata,
      chapters: [
        { at: 0, title: 'First' },
        { at: 0, title: 'Duplicate' },
      ],
    },
    {
      ...metadata,
      reasoning: [
        { at: 2, text: 'Later' },
        { at: 1, text: 'Earlier' },
      ],
    },
    { ...metadata, reasoning: [{ at: 0, kind: 'unknown', text: 'Invalid' }] },
    { ...metadata, reasoning: [{ at: 0, text: ' '.repeat(4) }] },
    {
      ...metadata,
      reasoning: [{ at: Number.POSITIVE_INFINITY, text: 'Invalid' }],
    },
  ])('rejects invalid metadata', (value) => {
    expect(metadataSchema.safeParse(value).success).toBe(false);
  });
  it('supports fractional times and simultaneous notes', () => {
    const value = {
      ...metadata,
      reasoning: [
        { at: 1.5, text: 'First' },
        { at: 1.5, text: 'Second' },
      ],
    };
    expect(metadataSchema.parse(value).reasoning).toEqual(value.reasoning);
  });
  it('permits empty chapter and reasoning arrays', () => {
    expect(
      metadataSchema.safeParse({ ...metadata, chapters: [], reasoning: [] })
        .success,
    ).toBe(true);
  });
});
