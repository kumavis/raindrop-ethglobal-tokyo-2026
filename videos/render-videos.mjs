#!/usr/bin/env node
// render-videos.mjs — render Raindrop HTML films to MP4.
//
// Setup (once):  npm install   (from the repo root; also fetches Chromium)
//                (ffmpeg must be on your PATH — see README.md)
// Usage:         node render-videos.mjs [--out-dir dir] film.html [more.html ...]
//
// Output goes next to each source file (film.html -> film.mp4).
// Environment overrides:
//   DURATION=12    render only the first N seconds (default: the DUR constant in the HTML)
//   FPS=30         frame rate (the films are timed for 30)
//   CRF=18         x264 quality (lower = better/bigger)
//   PRESET=medium  x264 preset
//   GRAIN=2        strength of the faint moving grain that dithers gradients (0 disables)
//   BITDEPTH=8     8 (plays everywhere, the default) or 10 (smoother gradients, for YouTube/archival;
//                  most browsers can't play 10-bit H.264)
//   BLOCK_FONTS=1  skip Google Fonts and use locally installed fonts instead
//   OUT_DIR=dir    write MP4s here instead of next to the sources (same as --out-dir)

import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
let outDirArg;
const o = args.indexOf('--out-dir');
if (o !== -1) [, outDirArg] = args.splice(o, 2);
const files = args;
if (!files.length) {
  console.log('usage: node render-videos.mjs [--out-dir dir] film.html [more.html ...]');
  process.exit(1);
}
if (spawnSync('ffmpeg', ['-version']).error) {
  console.error('error: ffmpeg not found on PATH');
  process.exit(1);
}

const FPS = +process.env.FPS || 30;
const CRF = process.env.CRF || '18';
const PRESET = process.env.PRESET || 'medium';
const GRAIN = process.env.GRAIN ?? '2';
const BITDEPTH = process.env.BITDEPTH === '10' ? 10 : 8;
// Frames are captured losslessly as PNG, then converted to BT.709 video. Gradients band in 8-bit
// video, so a faint temporal grain and error-diffusion dithering (zscale, when ffmpeg has it) break
// the bands up. The output is tagged BT.709 so players show the colours the page rendered.
const hasZscale = /\bzscale\b/.test(spawnSync('ffmpeg', ['-hide_banner', '-filters']).stdout?.toString() ?? '');
const PIX = BITDEPTH === 10 ? 'yuv420p10le' : 'yuv420p';
const VF = [
  +GRAIN > 0 && `format=gbrp,noise=alls=${+GRAIN}:allf=t`,
  hasZscale ? `zscale=transferin=709:primariesin=709:rangein=full:matrix=709:transfer=709:primaries=709:range=limited:dither=${BITDEPTH === 10 ? 'none' : 'error_diffusion'}`
            : 'scale=out_color_matrix=bt709:out_range=tv',
  `format=${PIX}`,
].filter(Boolean).join(',');

const browser = await chromium.launch();

for (const src of files) {
  if (!fs.existsSync(src)) { console.log(`skip: ${src} not found`); continue; }
  const html = fs.readFileSync(src, 'utf8');
  const m = html.match(/const DUR=([\d.]+)/);
  const dur = +process.env.DURATION || (m ? +m[1] : NaN);
  if (!dur) { console.error(`skip: no DUR in ${src} (set DURATION=seconds)`); continue; }
  const N = Math.round(dur * FPS);
  const outDir = outDirArg || process.env.OUT_DIR || path.dirname(src);
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, path.basename(src, path.extname(src)) + '.mp4');
  console.log(`==> ${src}`);

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  if (process.env.BLOCK_FONTS === '1') await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  page.on('pageerror', e => console.error('  page error:', e.message));
  // Virtual clock: the page's requestAnimationFrame only advances when we ask it to.
  await page.addInitScript(() => {
    const q = []; window.requestAnimationFrame = cb => (q.push(cb), q.length);
    window.__frame = ms => { const c = q.splice(0); c.forEach(f => f(ms)); };
  });
  await page.goto(pathToFileURL(path.resolve(src)).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-vf', VF, '-c:v', 'libx264', '-profile:v', BITDEPTH === 10 ? 'high10' : 'high', '-tune', 'grain', '-crf', CRF, '-preset', PRESET,
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c ? rej(new Error('ffmpeg exited ' + c)) : res()));

  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    await page.evaluate(ms => { __frame(ms); __frame(ms); }, i * 1000 / FPS);
    const buf = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % FPS === 0 || i === N - 1) process.stdout.write(`\r  frame ${i + 1}/${N}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await done;
  await page.close();
  console.log(`\n  -> ${out} (${dur}s @ ${FPS}fps)`);
}

await browser.close();
