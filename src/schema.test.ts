import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { z } from 'zod';
import { demoMetadata } from './demo';
import { metadataSchema } from './schema';

describe('published JSON Schema', () => {
  const schema = z.toJSONSchema(metadataSchema, { target: 'draft-2020-12' });
  const validate = new Ajv2020().compile(schema);

  it('validates the same complete example as the runtime', () => {
    expect(validate(demoMetadata)).toBe(true);
    expect(metadataSchema.safeParse(demoMetadata).success).toBe(true);
  });
  it.each([
    { ...demoMetadata, version: 2 },
    { ...demoMetadata, unexpected: 'value' },
    { ...demoMetadata, video: 'https://evil.test/movie.mp4' },
    { ...demoMetadata, reasoning: [{ at: -1, text: 'Invalid' }] },
    { ...demoMetadata, reasoning: [{ at: 0, text: '   ' }] },
    { ...demoMetadata, chapters: [{ at: 1, title: '' }] },
  ])('rejects invalid shapes in both validators', (value) => {
    expect(validate(value)).toBe(false);
    expect(metadataSchema.safeParse(value).success).toBe(false);
  });
  it('retains case-sensitive repository names and uppercase video extensions', () => {
    const value = {
      ...demoMetadata,
      video:
        'https://github.com/Octo-Labs/Recordings/assets/1/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
    };
    expect(validate(value)).toBe(true);
    expect(metadataSchema.safeParse(value).success).toBe(true);
    value.video = 'https://user-images.githubusercontent.com/1/Recording.MP4';
    expect(validate(value)).toBe(true);
    expect(metadataSchema.safeParse(value).success).toBe(true);
  });
});
