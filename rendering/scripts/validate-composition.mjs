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
  stdin: {contents: `export {sceneCatalog, overlaysSchema} from './src/registry'; export {brandSchema} from './src/brand'; export {audioSettingsSchema, narrationSchema, voiceSchema, sfxCuesSchema, captionsSettingsSchema} from './src/audio';`, resolveDir: root, loader: 'ts'},
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
const {sceneCatalog, overlaysSchema, brandSchema, audioSettingsSchema, narrationSchema, voiceSchema, sfxCuesSchema, captionsSettingsSchema} = await import(pathToFileURL(bundled));

const fmtPath = (parts) => parts.map((p) => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('');

// --- "did you mean": short, precise errors instead of dumping every allowed value -----------------
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const pairs = (s) => { const out = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out; };
/** Similarity 0..1: containment counts most ("radiostudio" ~ "radio"), else shared letter pairs. */
const similar = (a, b) => {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.6 + 0.4 * Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const pa = pairs(a), pb = pairs(b), left = [...pb];
  let hit = 0;
  for (const x of pa) { const k = left.indexOf(x); if (k >= 0) { hit++; left.splice(k, 1); } }
  return (2 * hit) / (pa.length + pb.length || 1);
};
const closest = (value, options, n = 3) => [...options].map((o) => [o, similar(value, o)]).filter(([, s]) => s > 0.25)
  .sort((x, y) => y[1] - x[1]).slice(0, n).map(([o]) => `"${o}"`);
const lucideNames = await import('lucide-react').then((m) => Object.keys(m.icons).map((k) => k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Za-z])([0-9])/g, '$1-$2').toLowerCase()), () => []);
const valueAt = (obj, parts) => parts.reduce((o, k) => (o == null ? undefined : o[k]), obj);
/** A long list of allowed values or an unknown icon: name the wrong value and suggest the closest ones. */
const explain = (issue, data) => {
  const value = valueAt(data, issue.path);
  if (issue.code === 'invalid_value' && Array.isArray(issue.values) && issue.values.length > 12) {
    const near = closest(value, issue.values);
    return `unknown value ${JSON.stringify(value)}` + (near.length ? `; did you mean ${near.join(', ')}?` : '') + ` (${issue.values.length} allowed values)`;
  }
  if (typeof issue.message === 'string' && issue.message.startsWith('unknown icon name')) {
    const near = closest(value, lucideNames, 4);
    return `unknown icon ${JSON.stringify(value)}` + (near.length ? `; did you mean ${near.join(', ')}?` : '; use a Lucide icon name such as "megaphone" or "users"');
  }
  return issue.message;
};

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
  if (spec.brand !== undefined) {
    const r = typeof spec.brand === 'boolean' ? {success: true} : brandSchema.safeParse(spec.brand);
    if (!r.success) for (const issue of r.error.issues) errors.push(`brand${fmtPath(issue.path)}: ${issue.message}`);
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
        for (const issue of o.error.issues) errors.push(`${where}.overlays${fmtPath(issue.path)}: ${explain(issue, scene.overlays)}`);
      }
    }
    const entry = sceneCatalog[scene?.component];
    if (!entry) {
      const near = closest(scene?.component, Object.keys(sceneCatalog));
      errors.push(`${where}.component: unknown "${scene?.component}"` + (near.length ? `; did you mean ${near.join(', ')}?` : `. Known: ${Object.keys(sceneCatalog).join(', ')}`));
      return;
    }
    const result = entry.schema.safeParse(scene.props ?? {});
    if (!result.success) {
      for (const issue of result.error.issues) {
        const keys = issue.keys ? ` (${issue.keys.join(', ')})` : '';
        errors.push(`${where}.props${fmtPath(issue.path)}: ${explain(issue, scene.props ?? {})}${keys}`);
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
