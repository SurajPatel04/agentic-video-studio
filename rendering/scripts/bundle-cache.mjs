// One Remotion bundle per version of the code, reused by every render.
// Before: each render rebuilt the bundle and copied all of public/ (hundreds of MB of narration clips) into it.
// Now public/ is symlinked (new narration clips are visible without a rebuild) and the bundle is rebuilt only
// when a file in src/, public/ top level or the package files changes. Safe for renders running at once:
// a new bundle is built in a temporary folder and renamed into place; whoever renames first wins.
import {bundle} from '@remotion/bundler';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readdir, rename, rm, stat} from 'node:fs/promises';
import path from 'node:path';

const KEEP = 3; // newest bundles kept; older ones are deleted

async function* files(dir) {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else yield full;
  }
}

/** Hash of everything that changes the bundle's code (paths, sizes and modification times). */
async function codeKey(root) {
  const hash = createHash('sha256');
  const inputs = [path.join(root, 'package.json'), path.join(root, 'package-lock.json'), path.join(root, 'tsconfig.json'),
    path.join(root, 'remotion.config.ts')];
  for await (const file of files(path.join(root, 'src'))) inputs.push(file);
  for (const file of inputs.sort()) {
    if (!existsSync(file)) continue;
    const s = await stat(file);
    hash.update(`${path.relative(root, file)}\0${s.size}\0${s.mtimeMs}\n`);
  }
  return hash.digest('hex').slice(0, 16);
}

async function prune(cacheDir, current) {
  const entries = [];
  for (const name of await readdir(cacheDir)) {
    if (name === current) continue;
    const mtime = (await stat(path.join(cacheDir, name))).mtimeMs;
    if (name.includes('.tmp-')) {  // left by a render that crashed mid-build
      if (Date.now() - mtime > 3600_000) await rm(path.join(cacheDir, name), {recursive: true, force: true});
      continue;
    }
    entries.push({name, mtime});
  }
  entries.sort((a, b) => b.mtime - a.mtime);
  for (const {name} of entries.slice(KEEP - 1)) await rm(path.join(cacheDir, name), {recursive: true, force: true});
}

/** The serve URL (a folder) of a bundle for the current code, built only when the code changed. */
export async function cachedBundle(root) {
  const cacheDir = path.join(root, '.bundle-cache');
  const key = await codeKey(root);
  const ready = path.join(cacheDir, key);
  if (existsSync(path.join(ready, 'index.html'))) return {serveUrl: ready, built: false};
  const tmp = `${ready}.tmp-${process.pid}-${Date.now()}`;
  await bundle({entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public'),
    symlinkPublicDir: true, rootDir: root, outDir: tmp});
  try {
    await rename(tmp, ready);
  } catch (error) {
    await rm(tmp, {recursive: true, force: true}); // another render finished the same bundle first
    if (!existsSync(path.join(ready, 'index.html'))) throw error;
  }
  await prune(cacheDir, key).catch(() => {});
  return {serveUrl: ready, built: true};
}
