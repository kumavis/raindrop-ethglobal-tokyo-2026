// Local server for the simulator.
//   node dev.mjs            serve the source tree, live-reloading on changes to index.html or src/
//   node dev.mjs --preview  serve the production build in dist/ as-is
import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUT_DIR } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 4174;
const preview = process.argv.includes('--preview');
const ROOT = preview ? OUT_DIR : here;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};
const RELOAD_SCRIPT = `<script>new EventSource('/__reload').onmessage = () => location.reload();</script>`;
const clients = new Set();

// Only index.html and src/ are served in dev, so dev.mjs, node_modules etc. stay private.
// Returns null (a 404) for anything else, including malformed percent-encoding like /%E0.
function resolve(urlPath) {
  let rel;
  try {
    rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
  } catch {
    return null;
  }
  if (!preview && rel !== 'index.html' && !rel.startsWith('src/')) return null;
  const file = path.join(ROOT, rel);
  return file.startsWith(ROOT + path.sep) ? file : null;
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
  let body = await readFile(file);
  if (type.startsWith('text/html') && !preview) body = body.toString('utf8').replace('</body>', `${RELOAD_SCRIPT}\n</body>`);
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
});

if (!preview) {
  let timer;
  const reload = () => {
    clearTimeout(timer);
    timer = setTimeout(() => clients.forEach((c) => c.write('data: reload\n\n')), 60);
  };
  watch(path.join(here, 'src'), { recursive: true }, reload);
  watch(path.join(here, 'index.html'), reload);
}

server.listen(PORT, () => {
  console.log(`${preview ? 'previewing dist/' : 'simulator dev server'} at http://localhost:${PORT}/`);
});
