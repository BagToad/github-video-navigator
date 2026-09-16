import { z } from 'zod';
import { MAX_TIME, SCHEMA_URL, VIDEO_URL_PATTERN } from './urls';

z.config({ jitless: true });

const timestamp = z
  .number()
  .min(0)
  .max(MAX_TIME)
  .describe(
    'Seconds from the start of the video. Fractional seconds are supported.',
  );
const shortText = z.string().trim().min(1).max(180).regex(/\S/);

export const metadataSchema = z
  .strictObject({
    $schema: z.literal(SCHEMA_URL).optional(),
    version: z.literal(1),
    video: z
      .string()
      .max(4096)
      .regex(VIDEO_URL_PATTERN)
      .describe(
        'The exact HTTPS GitHub video URL also present in the visible Markdown.',
      ),
    title: shortText.optional(),
    chapters: z
      .array(
        z.strictObject({
          at: timestamp,
          title: shortText,
          description: z.string().trim().min(1).max(500).regex(/\S/).optional(),
        }),
      )
      .max(500)
      .describe(
        'Chapters in strictly increasing timestamp order. May be empty.',
      ),
    reasoning: z
      .array(
        z.strictObject({
          at: timestamp,
          kind: z
            .enum(['observation', 'decision', 'action', 'result'])
            .optional(),
          title: shortText.optional(),
          text: z.string().trim().min(1).max(10_000).regex(/\S/),
          agent: z.string().trim().min(1).max(80).regex(/\S/).optional(),
        }),
      )
      .max(2000)
      .describe(
        'Author-provided notes in nondecreasing timestamp order. Notes at the same time are shown together and remain current until the next timestamp.',
      ),
  })
  .superRefine((metadata, context) => {
    for (let index = 1; index < metadata.chapters.length; index++) {
      const previous = metadata.chapters[index - 1];
      const current = metadata.chapters[index];
      if (previous && current && current.at <= previous.at) {
        context.addIssue({
          code: 'custom',
          path: ['chapters', index, 'at'],
          message: 'Chapter timestamps must be strictly increasing.',
        });
      }
    }
    for (let index = 1; index < metadata.reasoning.length; index++) {
      const previous = metadata.reasoning[index - 1];
      const current = metadata.reasoning[index];
      if (previous && current && current.at < previous.at) {
        context.addIssue({
          code: 'custom',
          path: ['reasoning', index, 'at'],
          message: 'Reasoning timestamps must be in ascending order.',
        });
      }
    }
  });

export type VideoMetadata = z.infer<typeof metadataSchema>;
export type Chapter = VideoMetadata['chapters'][number];
export type Reasoning = VideoMetadata['reasoning'][number];
