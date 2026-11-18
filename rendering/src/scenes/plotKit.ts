/**
 * Formula parser and plot helpers for the graph scenes (PlotScene, LiveChartScene).
 *
 * compile('a*x^2 + b') gives a function of named variables. No eval: a small parser that knows
 * + - * / % ^ (also ** × · ÷ −), brackets, implicit multiplication ("2x", "3(x+1)", "(x+1)(x-1)"),
 * the constants pi and e, and sin cos tan asin acos atan sqrt abs log ln exp floor ceil round min max
 * pow sign. A leading "y =" or "f(x) =" is dropped.
 */

export type Vars = Record<string, number>;
export type Compiled = {fn: (v: Vars) => number; vars: string[]; text: string};

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, abs: Math.abs, log: Math.log10, ln: Math.log, exp: Math.exp, floor: Math.floor,
  ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max, pow: Math.pow, sign: Math.sign,
};
const CONSTS: Record<string, number> = {pi: Math.PI, e: Math.E};

type Tok = {t: 'num'; v: number} | {t: 'id'; v: string} | {t: 'op'; v: string};

/** Drop "y =", "f(x) =", tidy unicode operators. */
export const cleanExpr = (src: string) => {
  let s = String(src).trim().replace(/\*\*/g, '^').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/π/g, 'pi');
  s = s.replace(/²/g, '^2').replace(/³/g, '^3');
  const eq = s.indexOf('=');
  if (eq >= 0 && s.indexOf('=', eq + 1) < 0) s = s.slice(eq + 1);
  return s.trim();
};

const tokenize = (s: string): Tok[] => {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { out.push({t: 'num', v: Number(num[0])}); i += num[0].length; continue; }
    const id = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(s.slice(i));
    if (id) { out.push({t: 'id', v: id[0]}); i += id[0].length; continue; }
    if ('+-*/%^(),'.includes(c)) { out.push({t: 'op', v: c}); i++; continue; }
    throw new Error(`unexpected "${c}"`);
  }
  // implicit multiplication: 2x, 2(x), x(…) for non-functions, )( , )x, x y
  const res: Tok[] = [];
  out.forEach((tk, j) => {
    const prev = out[j - 1];
    if (prev) {
      const leftOk = prev.t === 'num' || (prev.t === 'id' && !FUNCS[prev.v]) || (prev.t === 'op' && prev.v === ')');
      const rightOk = tk.t === 'num' ? prev.t !== 'num' : tk.t === 'id' || (tk.t === 'op' && tk.v === '(');
      if (leftOk && rightOk) res.push({t: 'op', v: '*'});
    }
    res.push(tk);
  });
  return res;
};

type Node = (v: Vars) => number;

export const compile = (src: string): Compiled => {
  const text = cleanExpr(src);
  const toks = tokenize(text);
  const vars = new Set<string>();
  let i = 0;
  const peek = () => toks[i];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
  const take = (v: string) => { if (!isOp(v)) throw new Error(`expected "${v}"`); i++; };
  const expr = (): Node => {
    let a = term();
    while (isOp('+') || isOp('-')) { const op = toks[i++].v; const l = a, r = term(); a = op === '+' ? (v) => l(v) + r(v) : (v) => l(v) - r(v); }
    return a;
  };
  const term = (): Node => {
    let a = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = toks[i++].v; const l = a, r = unary();
      a = op === '*' ? (v) => l(v) * r(v) : op === '/' ? (v) => l(v) / r(v) : (v) => l(v) % r(v);
    }
    return a;
  };
  const unary = (): Node => {
    if (isOp('-')) { i++; const a = unary(); return (v) => -a(v); }
    if (isOp('+')) { i++; return unary(); }
    return power();
  };
  const power = (): Node => {
    const base = atom();
    if (isOp('^')) { i++; const ex = unary(); return (v) => Math.pow(base(v), ex(v)); }
    return base;
  };
  const atom = (): Node => {
    const tk = toks[i++];
    if (!tk) throw new Error('formula ends too early');
    if (tk.t === 'num') return () => tk.v;
    if (tk.t === 'op' && tk.v === '(') { const a = expr(); take(')'); return a; }
    if (tk.t === 'id') {
      const name = tk.v;
      if (FUNCS[name] && isOp('(')) {
        i++;
        const args: Node[] = [];
        if (!isOp(')')) { args.push(expr()); while (isOp(',')) { i++; args.push(expr()); } }
        take(')');
        const fn = FUNCS[name];
        return (v) => fn(...args.map((a) => a(v)));
      }
      if (FUNCS[name]) throw new Error(`${name} needs brackets: ${name}(…)`);
      if (CONSTS[name] === undefined) vars.add(name);
      return (v) => (v[name] !== undefined ? v[name] : CONSTS[name] !== undefined ? CONSTS[name] : NaN);
    }
    throw new Error(`unexpected "${tk.v}"`);
  };
  if (!toks.length) throw new Error('empty formula');
  const fn = expr();
  if (i < toks.length) throw new Error(`unexpected "${(toks[i] as {v: unknown}).v}"`);
  return {fn, vars: [...vars], text};
};

/** compile() that returns an error message instead of throwing (for schema checks). */
export const tryCompile = (src: string): Compiled | string => {
  try { return compile(src); } catch (e) { return (e as Error).message; }
};

/** Pretty formula for the screen: x^2 → x², * → ·, sqrt → √. */
const SUP: Record<string, string> = Object.fromEntries([...'0123456789-abcdefghijklmnoprstuvwxyz'].map((c, i) => [c, '⁰¹²³⁴⁵⁶⁷⁸⁹⁻ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ'[i]]));
export const prettyExpr = (src: string) => cleanExpr(src)
  // simple exponents become superscripts: x^2 → x², (1+r)^t → (1+r)ᵗ, 2^(-n) → 2⁻ⁿ
  .replace(/\^\s*(\(\s*-?\s*(?:\d+|[a-z])\s*\)|-?(?:\d+|[a-z]))(?![\w.(])/g, (m, e: string) => {
    const s = e.replace(/[()\s]/g, '');
    return [...s].every((ch) => SUP[ch]) ? [...s].map((ch) => SUP[ch]).join('') : m;
  })
  .replace(/\s*\*\s*/g, '·').replace(/sqrt/g, '√').replace(/\bpi\b/g, 'π')
  .replace(/\s*([+\-/=])\s*/g, ' $1 ').replace(/\(\s+-\s+/g, '(-').replace(/^\s*-\s+/, '-').trim();

/** The formula with numbers in place of the named variables ("1000·(1 + 0.05)^10"). */
export const substitute = (src: string, vals: Vars, fmtN: (n: number) => string) =>
  prettyExpr(cleanExpr(src).replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (name, at: number, s: string) => {
    if (vals[name] === undefined || FUNCS[name]) return name;
    const v = vals[name] < 0 ? `(${fmtN(vals[name])})` : fmtN(vals[name]);
    // "2x" → "2·3", "a(x+1)" → "2·(x+1)": keep the implied multiplication visible once letters become numbers
    return (/[0-9.)]/.test(s[at - 1] ?? '') ? '*' : '') + v + (/^\s*[(0-9]/.test(s.slice(at + name.length)) ? '*' : '');
  }));

/** Round to a readable number of digits (3 significant by default). */
export const fmtNum = (n: number, digits?: number) => {
  if (!Number.isFinite(n)) return '—';
  if (digits !== undefined) return new Intl.NumberFormat('en-US', {maximumFractionDigits: digits, minimumFractionDigits: 0}).format(n);
  const a = Math.abs(n);
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 3 : 4;
  return new Intl.NumberFormat('en-US', {maximumFractionDigits: d}).format(n);
};

/** Nice axis: rounded bounds and ~count ticks. */
export const niceAxis = (lo: number, hi: number, count = 5) => {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  if (hi - lo < 1e-9) { const pad = Math.abs(hi) * 0.5 || 1; lo -= pad; hi += pad; }
  const raw = (hi - lo) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const min = Math.floor(lo / step + 1e-9) * step, max = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step * 1e-6; t += step) ticks.push(Math.abs(t) < step * 1e-9 ? 0 : t);
  return {min, max, step, ticks};
};

/** Even timeline for scene steps: spread over lead..94% of the scene; each move takes up to maxSec. */
export const timeline = (count: number, len: number, fps: number, lead = 0.1, maxSec = 2) => {
  const start = Math.round(len * lead), end = Math.round(len * 0.92);
  const slot = Math.max(1, (end - start) / Math.max(1, count));
  return {starts: Array.from({length: count}, (_, i) => start + i * slot), dur: Math.max(6, Math.min(slot * 0.8, fps * maxSec))};
};
