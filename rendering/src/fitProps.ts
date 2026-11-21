import type {z} from 'zod';

/**
 * Over-limit data fits instead of failing. A plan that gives one item too many, a sentence a few
 * characters too long or a number past its range is cut to the limit rather than sent back to the LLM
 * for a repair: lists keep their first items, text is shortened with "…", numbers are clamped.
 *
 * Only "too big" / "too small" issues are fitted, and never reference strings (ids, cues, icon or kind
 * names), since shortening those would point at something else. Anything else (unknown values, broken
 * references, a list with too FEW items) stays an error. The validator and the renderer both call this,
 * so what passes validation renders the same way.
 */
const REF_KEYS = new Set(['id', 'from', 'to', 'via', 'kind', 'icon', 'target', 'cue', 'appearCue', 'focusCue',
  'column', 'key', 'component', 'type', 'ref', 'src', 'href', 'url', 'language', 'lang']);
const MAX_ROUNDS = 8; // limits inside a list are only checked once the list itself fits

type Path = readonly PropertyKey[];
const fmt = (path: Path) => path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`)).join('');

export type Fitted<T> = {result: ReturnType<z.ZodType<T>['safeParse']>; data: unknown; notes: string[]};

export function fitProps<T>(schema: z.ZodType<T>, input: unknown): Fitted<T> {
  let data = input;
  let result = schema.safeParse(data);
  const notes: string[] = [];
  let cloned = false;
  for (let round = 0; !result.success && round < MAX_ROUNDS; round++) {
    let changed = false;
    for (const issue of result.error.issues as unknown as Array<Record<string, unknown>>) {
      const code = issue.code, path = issue.path as Path;
      if ((code !== 'too_big' && code !== 'too_small') || !path?.length) continue;
      if (!cloned) { data = structuredClone(data); cloned = true; }
      const key = path[path.length - 1];
      const parent = path.slice(0, -1).reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<PropertyKey, unknown>)[k] : undefined), data);
      if (!parent || typeof parent !== 'object') continue; // path of a preprocessed alias: nothing to fit here
      const holder = parent as Record<PropertyKey, unknown>;
      const value = holder[key], inclusive = issue.inclusive !== false;
      if (code === 'too_big') {
        const max = Number(issue.maximum);
        if (!Number.isFinite(max)) continue;
        if (Array.isArray(value) && value.length > max) {
          holder[key] = value.slice(0, max);
          notes.push(`${fmt(path)}: kept the first ${max} of ${value.length} items`);
          changed = true;
        } else if (typeof value === 'string' && value.length > max && !(typeof key === 'string' && REF_KEYS.has(key))) {
          holder[key] = max > 3 ? `${value.slice(0, max - 1).trimEnd()}…` : value.slice(0, max);
          notes.push(`${fmt(path)}: shortened to ${max} characters (was ${value.length})`);
          changed = true;
        } else if (typeof value === 'number' && inclusive && value > max) {
          holder[key] = max;
          notes.push(`${fmt(path)}: ${value} lowered to the maximum ${max}`);
          changed = true;
        }
      } else {
        const min = Number(issue.minimum);
        if (typeof value === 'number' && Number.isFinite(min) && inclusive && value < min) {
          holder[key] = min;
          notes.push(`${fmt(path)}: ${value} raised to the minimum ${min}`);
          changed = true;
        }
      }
    }
    if (!changed) break;
    result = schema.safeParse(data);
  }
  return {result, data, notes};
}
