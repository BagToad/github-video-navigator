import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
  const nonce =
    command === 'serve' ? randomBytes(16).toString('base64') : undefined;
  const boot = readFileSync(new URL('./src/boot.ts', import.meta.url), 'utf8');
  const hash = createHash('sha256').update(boot).digest('base64');
  return {
    base: './',
    html: { cspNonce: nonce },
    css: {
      lightningcss: {
        drafts: { customMedia: true },
      },
    },
    plugins: [
      {
        name: 'content-security-policy',
        transformIndexHtml: {
          order: 'pre',
          handler(html) {
            return {
              html: html
                .replace(
                  "script-src 'self'",
                  `script-src 'self' 'sha256-${hash}'${nonce ? ` 'nonce-${nonce}'` : ''}`,
                )
                .replace(
                  "style-src 'self'",
                  `style-src 'self'${nonce ? ` 'nonce-${nonce}'` : ''}`,
                ),
              tags: [{ tag: 'script', children: boot, injectTo: 'head' }],
            };
          },
        },
      },
    ],
    build: {
      target: 'es2022',
    },
  };
});
