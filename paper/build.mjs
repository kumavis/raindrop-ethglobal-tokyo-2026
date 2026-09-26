// Renders paper.md into a static site at dist/index.html.
// Math (\( \) and \[ \]) is pre-rendered with KaTeX; no client-side JS is needed.
// If the protocol-first film has been rendered (npm run render:protocol-first
// --workspace videos) it is copied in and embedded above the abstract. In dev
// builds (see dev.mjs) it isn't copied; the page points at media/, which the dev
// server maps straight onto the video's directory.
import { readFile, writeFile, mkdir, cp, access, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import katex from 'katex';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const SRC = path.join(here, 'paper.md');
const TEMPLATE = path.join(here, 'template.html');
export const OUT_DIR = path.join(here, 'dist');
const KATEX_DIST = path.dirname(require.resolve('katex/dist/katex.min.css'));
const DESIGN_SYSTEM = path.resolve(here, '../design-system');
// Design-system files the page uses, copied to dist/ds/ (same layout, so the CSS's relative URLs hold).
// Only the 1x cloud background: the 8 MB @2x is too heavy for the web.
const DS_FILES = [
  'tokens',
  'assets/logo/raindrop-icon.svg',
  'assets/components/glass-circle-token.svg',
  'assets/components/ripple.svg',
  'assets/components/sybil-split.svg',
  'assets/backgrounds/cloud-background.png',
];
export const VIDEO = path.resolve(here, process.env.VIDEO ?? '../videos/dist/protocol-first/video.mp4');
const POSTER = path.join(path.dirname(VIDEO), 'poster.jpg');
const POSTER_AT = process.env.POSTER_AT ?? '5'; // seconds; the title card

const exists = (f) => access(f).then(() => true, () => false);

// Copies the film (and a poster frame) into dist, unless `dev`. Returns the embed markup, or '' if not rendered.
async function embedVideo(dev) {
  if (!(await exists(VIDEO))) {
    console.warn(`warning: ${path.relative(process.cwd(), VIDEO)} not found; building without video`);
    return '';
  }
  const posterStale = !(await exists(POSTER)) || (await stat(POSTER)).mtimeMs < (await stat(VIDEO)).mtimeMs;
  if (posterStale) {
    // Written next to the video so it's reused (and cached in CI) alongside it.
    // Fall back to the first frame for short renders (e.g. DURATION=2).
    for (const at of [POSTER_AT, '0']) {
      const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', at, '-i', VIDEO, '-frames:v', '1', '-q:v', '3', POSTER]);
      if (r.error) break;
      if ((await exists(POSTER)) && (await stat(POSTER)).mtimeMs >= (await stat(VIDEO)).mtimeMs) break;
    }
    if (posterStale && !(await exists(POSTER))) console.warn('warning: could not extract poster frame (is ffmpeg on PATH?)');
  }
  const hasPoster = await exists(POSTER);
  const base = dev ? 'media/' : '';
  if (!dev) {
    await cp(VIDEO, path.join(OUT_DIR, 'video.mp4'));
    if (hasPoster) await cp(POSTER, path.join(OUT_DIR, 'poster.jpg'));
  }
  return `<figure class="film">
  <video controls playsinline preload="metadata"${hasPoster ? ` poster="${base}poster.jpg"` : ''} width="1920" height="1080">
    <source src="${base}video.mp4" type="video/mp4">
  </video>
</figure>`;
}

const slugify = (s) =>
  s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Pull math out before markdown parsing so marked doesn't eat the backslashes.
function extractMath(md) {
  const math = [];
  const stash = (tex, displayMode) => {
    math.push(katex.renderToString(tex.trim(), { displayMode, throwOnError: false }));
    return `@@MATH${math.length - 1}@@`;
  };
  md = md
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => stash(tex, true))
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => stash(tex, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => stash(tex, false));
  return { md, restore: (html) => html.replace(/@@MATH(\d+)@@/g, (_, i) => math[i]) };
}

function render(source) {
  const { md, restore } = extractMath(source);
  const toc = [];
  let title = 'Paper';
  let section = null;

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        if (depth === 1) {
          title = text;
          return '';
        }
        const id = slugify(text);
        if (depth === 2) section = id;
        if (depth <= 3) toc.push({ depth, id, text });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${depth}>\n`;
      },
      paragraph({ tokens }) {
        let html = this.parser.parseInline(tokens);
        if (section === 'references') {
          // "[1] Author..." → anchored reference entry with linked URLs
          const m = html.match(/^\[(\d+)\]\s*/);
          if (m) {
            html = html
              .slice(m[0].length)
              .replace(/(?<!href=")(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
            return `<p class="ref" id="ref-${m[1]}"><span class="ref-num">[${m[1]}]</span><span>${html}</span></p>\n`;
          }
        }
        return `<p>${html}</p>\n`;
      },
    },
  });

  let body = marked.parse(md);
  body = restore(body);
  // In-text citations "[1]" → links to the reference entry
  body = body.replace(/(^|[^">\w])\[(\d+)\](?![^<]*<\/span>)/g, '$1<a class="cite" href="#ref-$2">[$2]</a>');
  // Wrap the abstract section so it can be styled as a lead block
  body = body.replace(
    /(<h2 id="abstract">[\s\S]*?)(?=<h2 )/,
    '<section class="abstract glass">$1</section>\n',
  );
  // Sybil split figure after the first paragraph of the Sybil resistance section
  body = body.replace(
    /(<h2 id="6-sybil-resistance">[\s\S]*?<\/p>\n)/,
    `$1<figure class="figure"><img src="ds/assets/components/sybil-split.svg" width="296" height="180" alt="One large circle splitting into many small circles"><figcaption>One balance split across many accounts carries the same total weight.</figcaption></figure>\n`,
  );

  const tocHtml = toc
    .map((t) => `<li class="toc-${t.depth}"><a href="#${t.id}">${t.text.replace(/<a[^>]*>|<\/a>/g, '')}</a></li>`)
    .join('\n');

  // The name is a lowercase wordmark in the hero and tab title; the paper's prose keeps "Raindrop".
  title = title.replace(/^Raindrop\b/, 'raindrop');
  const [heading, subtitle] = title.split(/:\s*(.+)/);
  return { title, heading, subtitle, body, tocHtml };
}

export async function build({ dev = false } = {}) {
  const [source, template] = await Promise.all([readFile(SRC, 'utf8'), readFile(TEMPLATE, 'utf8')]);
  const { title, heading, subtitle, body, tocHtml } = render(source);
  await mkdir(OUT_DIR, { recursive: true });
  const video = await embedVideo(dev);
  const html = template
    .replaceAll('{{title}}', escapeHtml(title.replace(/<[^>]+>/g, '')))
    .replace('{{heading}}', heading)
    .replace('{{subtitle}}', subtitle ?? '')
    .replace('{{toc}}', tocHtml)
    .replace('{{video}}', video)
    .replace('{{body}}', body);

  await cp(KATEX_DIST, path.join(OUT_DIR, 'katex'), {
    recursive: true,
    filter: (f) => !/\.(js|mjs)$/.test(f) && !f.includes(`${path.sep}contrib`),
  });
  for (const f of DS_FILES) {
    await cp(path.join(DESIGN_SYSTEM, f), path.join(OUT_DIR, 'ds', f), { recursive: true });
  }
  await writeFile(path.join(OUT_DIR, 'index.html'), html);
  console.log(`built ${path.relative(process.cwd(), path.join(OUT_DIR, 'index.html'))}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await build();
