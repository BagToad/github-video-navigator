import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { demoMetadata } from '../src/demo';

const directory = new URL('../public/demo/', import.meta.url);
await mkdir(directory, { recursive: true });
const font = await readFile(
  new URL(
    '../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
    import.meta.url,
  ),
);
const theme = await readFile(
  new URL('../src/theme.css', import.meta.url),
  'utf8',
);
const icon = await readFile(new URL('../public/favicon.svg', import.meta.url));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`
  <style>
    ${theme}
    @font-face { font-family: Geist; src: url(data:font/woff2;base64,${font.toString('base64')}); }
    body { margin: 0; font-family: Geist, sans-serif; }
    canvas { display: block; }
  </style>
  <img id="demo-mark" src="data:image/svg+xml;base64,${icon.toString('base64')}" alt="" hidden />
  <canvas width="1280" height="720"></canvas>
`);
  const palette = await page.evaluate(async () => {
    await document.fonts.load('500 48px Geist');
    const mark = document.querySelector<HTMLImageElement>('#demo-mark');
    if (!mark) throw new Error('The demo brand mark is missing.');
    await mark.decode();
    const styles = getComputedStyle(document.documentElement);
    const colors = {
      surface: styles.getPropertyValue('--media-surface').trim(),
      ink: styles.getPropertyValue('--media-ink').trim(),
      muted: styles.getPropertyValue('--media-muted').trim(),
      accent: styles.getPropertyValue('--media-accent').trim(),
      line: styles.getPropertyValue('--media-line').trim(),
    };
    for (const [name, value] of Object.entries(colors)) {
      if (!value) throw new Error(`The demo palette is missing ${name}.`);
    }
    return colors;
  });
  const encoder = spawn(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'image2pipe',
      '-framerate',
      '24',
      '-i',
      'pipe:0',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-an',
      fileURLToPath(new URL('walkthrough.mp4', directory)),
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let encoderErrors = '';
  encoder.stderr.on('data', (chunk: Buffer) => {
    encoderErrors += chunk.toString();
  });
  const finished = new Promise<void>((resolve, reject) => {
    encoder.on('error', reject);
    encoder.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`ffmpeg failed with code ${code}: ${encoderErrors}`));
    });
  });

  try {
    for (let frame = 0; frame < 40 * 24; frame++) {
      await page.evaluate(
        ({ time, metadata, palette }) => {
          const canvas = document.querySelector('canvas');
          const context = canvas?.getContext('2d');
          const mark = document.querySelector<HTMLImageElement>('#demo-mark');
          if (!canvas || !context || !mark)
            throw new Error('Demo rendering assets are unavailable.');
          const ctx = context;
          const chapters = metadata.chapters;
          const current = Math.min(3, Math.floor(time / 10));
          const chapter = chapters[current];
          const note = metadata.reasoning.findLast((item) => item.at <= time);
          if (!chapter || !note)
            throw new Error('Demo timeline is incomplete.');
          const titles = [
            ['A recording.', 'With the context included.'],
            ['Skip the searching.', 'Start at the useful part.'],
            ['See what happened.', 'Understand the decision.'],
            ['The right moment.', 'One link away.'],
          ];
          const descriptions = [
            'Video, chapters, and recorded notes. Together in your browser.',
            'Every chapter is a place to pause, replay, or start a conversation.',
            'Observations, actions, and results follow the video as it plays.',
            'A shared link brings the source, the recording, and the timestamp.',
          ];
          ctx.fillStyle = palette.surface;
          ctx.fillRect(0, 0, 1280, 720);
          ctx.drawImage(mark, 64, 43, 30, 30);
          ctx.fillStyle = palette.muted;
          ctx.font = '500 15px Geist';
          ctx.fillText('VIDEO NAVIGATOR', 106, 67);
          ctx.fillStyle = palette.muted;
          ctx.font = '400 14px Geist';
          ctx.textAlign = 'right';
          ctx.fillText(
            `${Math.floor(time).toString().padStart(2, '0')} / 40 seconds`,
            1216,
            67,
          );
          ctx.textAlign = 'left';
          ctx.font = '500 56px Geist';
          ctx.fillStyle = palette.ink;
          ctx.fillText(titles[current]?.[0] ?? '', 64, 180);
          ctx.fillStyle = palette.ink;
          ctx.fillText(titles[current]?.[1] ?? '', 64, 249);
          ctx.fillStyle = palette.muted;
          ctx.font = '400 21px Geist';
          ctx.fillText(descriptions[current] ?? '', 64, 310);
          ctx.strokeStyle = palette.line;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(78, 434);
          ctx.lineTo(1198, 434);
          ctx.stroke();
          ctx.strokeStyle = palette.accent;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(78, 434);
          ctx.lineTo(78 + (time / 40) * 1120, 434);
          ctx.stroke();
          const names = ['Recording', 'Chapters', 'Decisions', 'Sharing'];
          for (let index = 0; index < 4; index++) {
            const x = 78 + index * 280;
            ctx.beginPath();
            ctx.arc(x, 434, index === current ? 7 : 5, 0, 2 * Math.PI);
            ctx.fillStyle = index <= current ? palette.accent : palette.line;
            ctx.fill();
            ctx.fillStyle = index === current ? palette.ink : palette.muted;
            ctx.font = '500 18px Geist';
            ctx.fillText(names[index] ?? '', x - 14, 480);
            ctx.fillStyle = palette.muted;
            ctx.font = '400 14px Geist';
            ctx.fillText(
              `0:${String(index * 10).padStart(2, '0')}`,
              x - 14,
              508,
            );
          }
          ctx.strokeStyle = palette.line;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(64, 558);
          ctx.lineTo(1216, 558);
          ctx.stroke();
          ctx.fillStyle = palette.accent;
          ctx.font = '500 14px Geist';
          ctx.fillText(
            `${(note.kind ?? 'decision').toUpperCase()}  /  0:${String(note.at).padStart(2, '0')}`,
            64,
            605,
          );
          ctx.fillStyle = palette.ink;
          ctx.font = '500 22px Geist';
          ctx.fillText(note.title ?? '', 64, 645);
        },
        { time: frame / 24, metadata: demoMetadata, palette },
      );
      const image = await page.screenshot({ type: 'png' });
      if (frame === 0) {
        const poster = await page.evaluate(() => {
          const canvas = document.querySelector('canvas');
          if (!canvas) throw new Error('Demo canvas is missing.');
          return canvas.toDataURL('image/webp', 0.9);
        });
        const data = poster.split(',')[1];
        if (!poster.startsWith('data:image/webp;') || !data) {
          throw new Error('The browser could not encode the WebP poster.');
        }
        await writeFile(
          new URL('poster.webp', directory),
          Buffer.from(data, 'base64'),
        );
      }
      if (!encoder.stdin.write(image)) await once(encoder.stdin, 'drain');
    }
    encoder.stdin.end();
    await finished;
  } finally {
    encoder.stdin.destroy();
    if (encoder.exitCode === null) encoder.kill('SIGTERM');
  }
} finally {
  await browser.close();
}

function vttTime(time: number): string {
  return `00:00:${String(time).padStart(2, '0')}.000`;
}
const cues = demoMetadata.reasoning.map((note, index) => {
  const next = demoMetadata.reasoning[index + 1]?.at ?? 40;
  return `${vttTime(note.at)} --> ${vttTime(next)}\n${note.title}\n${note.text}`;
});
await writeFile(
  new URL('captions.vtt', directory),
  `WEBVTT\n\n${cues.join('\n\n')}\n`,
);
console.log('Generated the 40-second demo, poster, and captions.');
