import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { metadataSchema } from '../src/schema';
import { SCHEMA_URL } from '../src/urls';

const schema = z.toJSONSchema(metadataSchema, { target: 'draft-2020-12' });
await mkdir(new URL('../public/schema/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../public/schema/v1.json', import.meta.url),
  `${JSON.stringify({ ...schema, $id: SCHEMA_URL, title: 'Video navigator metadata v1' }, null, 2)}\n`,
);
