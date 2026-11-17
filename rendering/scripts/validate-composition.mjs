// Validate composition JSON files against the scene catalog before rendering.
// Usage: node scripts/validate-composition.mjs <file.json> [more.json ...]
// Exit code 0 = all valid, 1 = errors (printed one per line, with the exact JSON path).
import {build} from 'esbuild';
import {mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/validate-composition.mjs <file.json> [...]');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');
await mkdir(path.join(root, 'out'), {recursive: true});
const bundled = path.join(root, 'out', 'validate-catalog.mjs');
await build({
  stdin: {contents: `export {sceneCatalog, overlaysSchema} from './src/registry'; export {audioSettingsSchema, narrationSchema, voiceSchema, sfxCuesSchema, captionsSettingsSchema} from './src/audio';`, resolveDir: root, loader: 'ts'},
  outfile: bundled,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  loader: {'.css': 'empty'},
  plugins: [{
    name: 'bundle-world-map',
    setup(b) {
      b.onResolve({filter: /^world-atlas\//}, (args) => ({path: path.join(root, 'node_modules', args.path), external: false}));
    },
  }],
  logLevel: 'silent',
});
const {sceneCatalog, overlaysSchema, audioSettingsSchema, narrationSchema, voiceSchema, sfxCuesSchema, captionsSettingsSchema} = await import(pathToFileURL(bundled));

const fmtPath = (parts) => parts.map((p) => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('');

/** Returns a list of human-readable errors for one composition object. */
export const validateComposition = (spec) => {
  const errors = [];
  for (const key of ['fps', 'width', 'height']) {
    if (!Number.isInteger(spec[key]) || spec[key] <= 0) errors.push(`${key}: must be a positive integer`);
  }
  if (!Array.isArray(spec.scenes) || spec.scenes.length === 0) {
    errors.push('scenes: must be a non-empty array');
    return errors;
  }
  if (spec.audio !== undefined) {
    const r = audioSettingsSchema.safeParse(spec.audio);
    if (!r.success) for (const issue of r.error.issues) errors.push(`audio${fmtPath(issue.path)}: ${issue.message}`);
  }
  if (spec.captions !== undefined) {
    const r = captionsSettingsSchema.safeParse(spec.captions);
    if (!r.success) for (const issue of r.error.issues) errors.push(`captions${fmtPath(issue.path)}: ${issue.message}`);
  }
  const seen = new Set();
  spec.scenes.forEach((scene, i) => {
    const where = `scenes[${i}]${scene?.id ? ` (${scene.id})` : ''}`;
    if (!scene?.id) errors.push(`${where}.id: required`);
    else if (seen.has(scene.id)) errors.push(`${where}.id: duplicate id "${scene.id}"`);
    seen.add(scene?.id);
    if (!Number.isInteger(scene?.durationInFrames) || scene.durationInFrames <= 0) {
      errors.push(`${where}.durationInFrames: must be a positive integer`);
    }
    for (const [field, schema] of [['narration', narrationSchema], ['voice', voiceSchema], ['sfx', sfxCuesSchema]]) {
      if (scene?.[field] === undefined) continue;
      const r = schema.safeParse(scene[field]);
      if (!r.success) for (const issue of r.error.issues) errors.push(`${where}.${field}${fmtPath(issue.path)}: ${issue.message}`);
    }
    if (scene?.overlays !== undefined) {
      const o = overlaysSchema.safeParse(scene.overlays);
      if (!o.success) {
        for (const issue of o.error.issues) errors.push(`${where}.overlays${fmtPath(issue.path)}: ${issue.message}`);
      }
    }
    const entry = sceneCatalog[scene?.component];
    if (!entry) {
      errors.push(`${where}.component: unknown "${scene?.component}". Known: ${Object.keys(sceneCatalog).join(', ')}`);
      return;
    }
    const result = entry.schema.safeParse(scene.props ?? {});
    if (!result.success) {
      for (const issue of result.error.issues) {
        const keys = issue.keys ? ` (${issue.keys.join(', ')})` : '';
        errors.push(`${where}.props${fmtPath(issue.path)}: ${issue.message}${keys}`);
      }
    }
  });
  return errors;
};

let failed = 0;
for (const file of files) {
  const spec = JSON.parse(await readFile(file, 'utf8'));
  const errors = validateComposition(spec);
  if (errors.length) {
    failed++;
    console.log(`✗ ${file}`);
    for (const e of errors) console.log(`  ${e}`);
  } else {
    console.log(`✓ ${file} (${spec.scenes.length} scenes)`);
  }
}
process.exit(failed ? 1 : 0);
