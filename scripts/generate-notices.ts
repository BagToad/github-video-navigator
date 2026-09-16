import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const packages = [
  '@fontsource-variable/geist',
  '@primer/css',
  '@primer/primitives',
  '@tabler/icons',
  'entities',
  'marked',
  'zod',
];
const notices = await Promise.all(
  packages.map(async (name) => {
    const directory = new URL(`../node_modules/${name}/`, import.meta.url);
    const files = await readdir(directory);
    const license = files.find((file) => /^licen[sc]e(?:[.-]|$)/i.test(file));
    if (!license) throw new Error(`No license file found for ${name}.`);
    return `${name}\n${'='.repeat(name.length)}\n\n${await readFile(new URL(license, directory), 'utf8')}`;
  }),
);
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../public/third-party-notices.txt', import.meta.url),
  `Third-party notices\n\n${notices.join('\n\n').trimEnd()}\n`,
);
