import { decodeHTML } from 'entities';
import { Lexer, walkTokens } from 'marked';
import { NavigatorError } from './errors';
import { metadataSchema, type VideoMetadata } from './schema';
import { videoUrl } from './urls';

export interface Recording {
  video: string;
  index: number;
  metadata?: VideoMetadata;
  warnings: string[];
}

export interface ParsedDocument {
  recordings: Recording[];
  warnings: string[];
}

export function parseDocument(markdown: string): ParsedDocument {
  if (markdown.length > 1_000_000) {
    throw new NavigatorError(
      'This Markdown body exceeds the 1 MB parsing limit.',
      'metadata',
    );
  }
  const videos = new Set<string>();
  const blocks: string[] = [];
  const warnings: string[] = [];
  const tokens = Lexer.lex(markdown, { gfm: true });
  walkTokens(tokens, (token) => {
    if (token.type === 'link') {
      const url = videoUrl(decodeHTML(token.href));
      if (url) videos.add(url);
    }
    if (token.type !== 'html') return;

    if (/^\s*<(?:script|style|textarea|pre|code)\b/i.test(token.raw)) return;
    for (const comment of token.raw.matchAll(/<!--([\s\S]*?)(?:-->|$)/g)) {
      const content = comment[1] ?? '';
      if (!/^\s*video-navigator(?:\s|$)/.test(content)) continue;
      if (!comment[0].endsWith('-->')) {
        warnings.push(
          'A video-navigator metadata comment is missing its closing --> marker.',
        );
        continue;
      }
      blocks.push(content.replace(/^\s*video-navigator\s*/, ''));
    }
    const html = token.raw
      .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
      .replace(
        /<(script|style|textarea|pre|code)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,
        '',
      );
    for (const tag of html.matchAll(/<(?:video|source)\b[^>]*>/gi)) {
      const src = tag[0].match(
        /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
      );
      const url = videoUrl(decodeHTML(src?.[1] ?? src?.[2] ?? src?.[3] ?? ''));
      if (url) videos.add(url);
    }
  });
  if (videos.size > 100 || blocks.length > 100) {
    throw new NavigatorError(
      'A body may contain at most 100 videos and 100 metadata blocks.',
      'metadata',
    );
  }

  const metadata = new Map<string, VideoMetadata>();
  const duplicates = new Set<string>();
  for (const [index, block] of blocks.entries()) {
    let value: unknown;
    try {
      value = JSON.parse(block);
    } catch {
      warnings.push(
        `Metadata block ${index + 1} is not valid JSON. Its chapters and notes were not loaded.`,
      );
      continue;
    }
    const result = metadataSchema.safeParse(value);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.join('.') || 'root';
      const message =
        issue?.code === 'custom'
          ? issue.message
          : 'Check the version 1 schema for the expected value.';
      warnings.push(
        `Metadata block ${index + 1} is invalid at ${path}. ${message}`,
      );
      continue;
    }
    const url = videoUrl(result.data.video);
    if (!url || !videos.has(url)) {
      warnings.push(
        `Metadata block ${index + 1} does not match a video in the visible Markdown.`,
      );
      continue;
    }
    if (metadata.has(url) || duplicates.has(url)) {
      metadata.delete(url);
      duplicates.add(url);
      continue;
    }
    metadata.set(url, result.data);
  }

  return {
    warnings,
    recordings: [...videos].map((url, index) => ({
      video: url,
      index: index + 1,
      metadata: metadata.get(url),
      warnings: duplicates.has(url)
        ? [
            'Multiple metadata blocks target this video. Keep only one block to enable chapters and notes.',
          ]
        : [],
    })),
  };
}
