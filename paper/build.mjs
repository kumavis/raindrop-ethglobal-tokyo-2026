// Renders paper.md into a static site at dist/index.html.
// Math (\( \) and \[ \]) is pre-rendered with KaTeX; no client-side JS is needed.
import { readFile, writeFile, mkdir, cp, watch } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import katex from 'katex';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const SRC = path.join(here, 'paper.md');
const TEMPLATE = path.join(here, 'template.html');
const OUT_DIR = path.join(here, 'dist');
const KATEX_DIST = path.dirname(require.resolve('katex/dist/katex.min.css'));

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
    '<section class="abstract">$1</section>\n',
  );

  const tocHtml = toc
    .map((t) => `<li class="toc-${t.depth}"><a href="#${t.id}">${t.text.replace(/<a[^>]*>|<\/a>/g, '')}</a></li>`)
    .join('\n');

  const [heading, subtitle] = title.split(/:\s*(.+)/);
  return { title, heading, subtitle, body, tocHtml };
}

async function build() {
  const [source, template] = await Promise.all([readFile(SRC, 'utf8'), readFile(TEMPLATE, 'utf8')]);
  const { title, heading, subtitle, body, tocHtml } = render(source);
  const html = template
    .replaceAll('{{title}}', escapeHtml(title.replace(/<[^>]+>/g, '')))
    .replace('{{heading}}', heading)
    .replace('{{subtitle}}', subtitle ?? '')
    .replace('{{toc}}', tocHtml)
    .replace('{{body}}', body);

  await mkdir(OUT_DIR, { recursive: true });
  await cp(KATEX_DIST, path.join(OUT_DIR, 'katex'), {
    recursive: true,
    filter: (f) => !/\.(js|mjs)$/.test(f) && !f.includes(`${path.sep}contrib`),
  });
  await writeFile(path.join(OUT_DIR, 'index.html'), html);
  console.log(`built ${path.relative(process.cwd(), path.join(OUT_DIR, 'index.html'))}`);
}

await build();

if (process.argv.includes('--watch')) {
  console.log('watching paper.md and template.html…');
  for await (const e of watch(here)) {
    if (e.filename === 'paper.md' || e.filename === 'template.html') {
      await build().catch((err) => console.error(err));
    }
  }
}
