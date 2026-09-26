// Local server for the paper.
//   node dev.mjs            dev build, rebuild + live reload on paper.md / template.html changes,
//                           video served from its render directory at media/
//   node dev.mjs --preview  serve the production build in dist/ as-is
// Supports HTTP Range requests, which browsers (Safari especially) need to play and seek MP4.
import { createServer } from 'node:http';
import { createReadStream, watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, OUT_DIR, VIDEO } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 4173;
const preview = process.argv.includes('--preview');
const MEDIA_DIR = path.dirname(VIDEO);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};
const RELOAD_SCRIPT = `<script>new EventSource('/__reload').onmessage = () => location.reload();</script>`;
const clients = new Set();

// Maps a URL path to a file, refusing anything that escapes its root.
function resolve(urlPath) {
  const [root, rel] = !preview && urlPath.startsWith('/media/')
    ? [MEDIA_DIR, urlPath.slice('/media/'.length)]
    : [OUT_DIR, urlPath.endsWith('/') ? urlPath + 'index.html' : urlPath];
  const file = path.join(root, decodeURIComponent(rel));
  return file.startsWith(root + path.sep) ? file : null;
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/__reload') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  const file = resolve(pathname);
  const info = file && (await stat(file).catch(() => null));
  if (!info?.isFile()) {
    res.writeHead(404).end('not found');
    return;
  }
  const type = TYPES[path.extname(file)] ?? 'application/octet-stream';

  if (type.startsWith('text/html') && !preview) {
    const html = (await readFile(file, 'utf8')).replace('</body>', `${RELOAD_SCRIPT}\n</body>`);
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(html);
    return;
  }

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range) {
    const start = range[1] ? +range[1] : Math.max(0, info.size - +range[2]);
    const end = range[1] && range[2] ? Math.min(+range[2], info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) {
      res.writeHead(416, { 'content-range': `bytes */${info.size}` }).end();
      return;
    }
    res.writeHead(206, {
      'content-type': type, 'accept-ranges': 'bytes',
      'content-range': `bytes ${start}-${end}/${info.size}`, 'content-length': end - start + 1,
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': info.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
});

if (!preview) {
  await build({ dev: true });
  let timer;
  watch(here, (_, filename) => {
    if (filename !== 'paper.md' && filename !== 'template.html') return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await build({ dev: true }).catch((err) => console.error(err));
      for (const c of clients) c.write('data: reload\n\n');
    }, 50);
  });
}

server.listen(PORT, () => {
  console.log(`${preview ? 'previewing dist/' : 'dev server'} at http://localhost:${PORT}/`);
});
