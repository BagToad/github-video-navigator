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
const icon = await readFile(
  new URL(
    '../node_modules/@tabler/icons/icons/outline/player-skip-forward.svg',
    import.meta.url,
  ),
  'utf8',
);
await writeFile(
  new URL('../public/favicon.svg', import.meta.url),
  icon.replace('stroke="currentColor"', 'stroke="#4493f8"'),
);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
await page.setContent(`
  <style>
    @font-face { font-family: Geist; src: url(data:font/woff2;base64,${font.toString('base64')}); }
    body { margin: 0; font-family: Geist, sans-serif; }
    canvas { display: block; }
  </style>
  <canvas width="1280" height="720"></canvas>
`);
await page.evaluate(async () => {
  await document.fonts.load('500 48px Geist');
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
    else reject(new Error(`ffmpeg failed with code ${code}: ${encoderErrors}`));
  });
});

try {
  for (let frame = 0; frame < 40 * 24; frame++) {
    await page.evaluate(
      ({ time, metadata }) => {
        const canvas = document.querySelector('canvas');
        const context = canvas?.getContext('2d');
        if (!canvas || !context) throw new Error('Canvas is not available.');
        const ctx = context;
        const chapters = metadata.chapters;
        const current = Math.min(3, Math.floor(time / 10));
        const chapter = chapters[current];
        const note = metadata.reasoning.findLast((item) => item.at <= time);
        if (!chapter || !note) throw new Error('Demo timeline is incomplete.');
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
        ctx.fillStyle = '#101820';
        ctx.fillRect(0, 0, 1280, 720);
        ctx.fillStyle = '#9cabbb';
        ctx.font = '500 15px Geist';
        ctx.fillText('VIDEO NAVIGATOR', 64, 67);
        ctx.fillStyle = '#a9b8c8';
        ctx.font = '400 14px Geist';
        ctx.textAlign = 'right';
        ctx.fillText(
          `${Math.floor(time).toString().padStart(2, '0')} / 40 seconds`,
          1216,
          67,
        );
        ctx.textAlign = 'left';
        ctx.font = '500 56px Geist';
        ctx.fillStyle = '#eff5fc';
        ctx.fillText(titles[current]?.[0] ?? '', 64, 180);
        ctx.fillStyle = '#80b6f9';
        ctx.fillText(titles[current]?.[1] ?? '', 64, 249);
        ctx.fillStyle = '#a9b8c8';
        ctx.font = '400 21px Geist';
        ctx.fillText(descriptions[current] ?? '', 64, 310);
        ctx.strokeStyle = '#34414f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(78, 434);
        ctx.lineTo(1198, 434);
        ctx.stroke();
        ctx.strokeStyle = '#80b6f9';
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
          ctx.fillStyle = index <= current ? '#80b6f9' : '#34414f';
          ctx.fill();
          ctx.fillStyle = index === current ? '#eff5fc' : '#a9b8c8';
          ctx.font = '500 18px Geist';
          ctx.fillText(names[index] ?? '', x - 14, 480);
          ctx.fillStyle = '#9cabbb';
          ctx.font = '400 14px Geist';
          ctx.fillText(`0:${String(index * 10).padStart(2, '0')}`, x - 14, 508);
        }
        ctx.strokeStyle = '#34414f';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(64, 558);
        ctx.lineTo(1216, 558);
        ctx.stroke();
        ctx.fillStyle = '#80b6f9';
        ctx.font = '500 14px Geist';
        ctx.fillText(
          `${(note.kind ?? 'decision').toUpperCase()}  /  0:${String(note.at).padStart(2, '0')}`,
          64,
          605,
        );
        ctx.fillStyle = '#eff5fc';
        ctx.font = '500 22px Geist';
        ctx.fillText(note.title ?? '', 64, 645);
      },
      { time: frame / 24, metadata: demoMetadata },
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
console.log('Generated the 40-second demo, poster, captions, and favicon.');
