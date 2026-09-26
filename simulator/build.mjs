// Builds the simulator into dist/. There is no bundling step: the app is plain ES
// modules, so the build is a copy of index.html and src/.
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = path.join(here, 'dist');
export const SOURCES = ['index.html', 'src'];

export async function build() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  for (const f of SOURCES) await cp(path.join(here, f), path.join(OUT_DIR, f), { recursive: true });
  console.log(`built ${path.relative(process.cwd(), OUT_DIR) || '.'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await build();
