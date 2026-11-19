/**
 * TreeScene and GraphScene, in the paper style.
 *
 * TreeScene: a binary search tree (insert walks down comparing, the node pops in), an AVL tree (after an
 * insert/delete the tree rebalances: nodes glide to their new places in each rotation), or any tree
 * (file system, DOM, org chart) given as nested {label, children}. Traversals (inorder, preorder,
 * postorder, bfs) light nodes up in order and build the output row.
 *
 * GraphScene: nodes and edges; BFS spreads level by level (the queue is shown), DFS goes deep and
 * backtracks (the stack is shown), Dijkstra settles the nearest node and relaxes edges (distances on
 * the nodes) and the shortest path lights up.
 */
import type {FC} from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {Sfx} from '../audio';
import {PAPER} from '../iso/iso';
import {useSceneLength, useUnit} from '../theme';
import {MONO, PaperStage, clamp01, flexValue, type Cue} from './paperStage';
import {FILL, NoteBar, Panel, arrowHead, argsOf, flexSteps, flexValues, lerp, playhead, schedule, show, stepSchema, valOf, type Step} from './dsaKit';

type V = string | number;
const same = (a: V | undefined, b: V | undefined) => a !== undefined && b !== undefined && String(a).toLowerCase() === String(b).toLowerCase();
const cmp = (a: V, b: V) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, {numeric: true}));

/* ================================================================== tree model */
type TN = {id: number; v: V; l?: number; r?: number; kids?: number[]};
type Tree = {nodes: Record<number, TN>; root?: number};
const cloneT = (t: Tree): Tree => ({root: t.root, nodes: Object.fromEntries(Object.entries(t.nodes).map(([k, n]) => [k, {...n, kids: n.kids ? [...n.kids] : undefined}]))});
const childrenOf = (t: Tree, id: number) => { const n = t.nodes[id]; return n.kids ? n.kids : [n.l, n.r].filter((x): x is number => x !== undefined); };
const height = (t: Tree, id?: number): number => (id === undefined ? 0 : 1 + Math.max(height(t, t.nodes[id].l), height(t, t.nodes[id].r)));
const bf = (t: Tree, id: number) => height(t, t.nodes[id].l) - height(t, t.nodes[id].r);
const parentOf = (t: Tree, id: number) => Object.values(t.nodes).find((n) => n.l === id || n.r === id || n.kids?.includes(id));
const relink = (t: Tree, old: number, nw: number | undefined) => {
  const p = parentOf(t, old);
  if (!p) t.root = nw;
  else if (p.kids) p.kids = p.kids.flatMap((k) => (k === old ? (nw === undefined ? [] : [nw]) : [k]));
  else if (p.l === old) p.l = nw; else p.r = nw;
};
const rotR = (t: Tree, y: number) => { const x = t.nodes[y].l!; relink(t, y, x); t.nodes[y].l = t.nodes[x].r; t.nodes[x].r = y; };
const rotL = (t: Tree, x: number) => { const y = t.nodes[x].r!; relink(t, x, y); t.nodes[x].r = t.nodes[y].l; t.nodes[y].l = x; };
const depthOf = (t: Tree, id: number) => { let d = 0, p = parentOf(t, id); while (p) { d++; p = parentOf(t, p.id); } return d; };
const order = (t: Tree, how: string): number[] => {
  const out: number[] = [];
  if (t.root === undefined) return out;
  if (how === 'bfs') { const q = [t.root]; while (q.length) { const x = q.shift()!; out.push(x); q.push(...childrenOf(t, x)); } return out; }
  const go = (id: number | undefined) => {
    if (id === undefined) return;
    const n = t.nodes[id];
    if (how === 'preorder') out.push(id);
    if (n.kids) { n.kids.forEach(go); if (how === 'inorder' && !out.includes(id)) out.push(id); }
    else { go(n.l); if (how === 'inorder') out.push(id); go(n.r); }
    if (how === 'postorder') out.push(id);
  };
  go(t.root);
  return out;
};
/** Positions in "slots": binary trees use the in-order index, other trees spread leaves evenly. */
const layoutT = (t: Tree): Record<number, {x: number; d: number}> => {
  const pos: Record<number, {x: number; d: number}> = {};
  if (t.root === undefined) return pos;
  const binary = !Object.values(t.nodes).some((n) => n.kids);
  if (binary) { let i = 0; const go = (id: number | undefined, d: number) => { if (id === undefined) return; go(t.nodes[id].l, d + 1); pos[id] = {x: i++, d}; go(t.nodes[id].r, d + 1); }; go(t.root, 0); return pos; }
  let leaf = 0;
  const go = (id: number, d: number): number => {
    const k = t.nodes[id].kids ?? [];
    const x = k.length ? k.map((c) => go(c, d + 1)).reduce((a, b) => a + b, 0) / k.length : leaf++;
    pos[id] = {x, d};
    return x;
  };
  go(t.root, 0);
  return pos;
};

const TREE_VERBS: Record<string, string> = {
  insert: 'insert', add: 'insert', push: 'insert', put: 'insert', append: 'insert', addchild: 'insert', child: 'insert', create: 'insert',
  delete: 'delete', remove: 'delete', del: 'delete', erase: 'delete', drop: 'delete',
  find: 'find', search: 'find', lookup: 'find', contains: 'find', get: 'find',
  traverse: 'traverse', traversal: 'traverse', walk: 'traverse', inorder: 'traverse', preorder: 'traverse', postorder: 'traverse', bfs: 'traverse', levelorder: 'traverse', dfs: 'traverse',
  visit: 'visit', highlight: 'visit', mark: 'visit', note: 'note', say: 'note', balance: 'balance', rebalance: 'balance',
};
const ORDER_ALIASES: Record<string, string> = {inorder: 'inorder', 'in-order': 'inorder', 'in order': 'inorder', preorder: 'preorder', 'pre-order': 'preorder', dfs: 'preorder', 'depth first': 'preorder', postorder: 'postorder', 'post-order': 'postorder', bfs: 'bfs', 'level order': 'bfs', levelorder: 'bfs', 'level-order': 'bfs', 'breadth first': 'bfs'};
type Nested = {label?: V; value?: V; name?: V; children?: Nested[]} | V;

const flexTree = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  for (const k of ['type', 'treeType', 'variant']) if (r.kind === undefined && typeof r[k] === 'string') { r.kind = r[k]; delete r[k]; }
  r.kind = flexValue(r.kind, {bst: 'bst', 'binary search tree': 'bst', binary: 'bst', 'binary tree': 'bst', avl: 'avl', 'avl tree': 'avl', balanced: 'avl', 'self-balancing': 'avl', tree: 'tree', general: 'tree', 'n-ary': 'tree', generic: 'tree', dom: 'tree', hierarchy: 'tree'});
  if (r.kind === undefined) delete r.kind;
  for (const k of ['initial', 'keys', 'items', 'numbers', 'data']) if (r.values === undefined && r[k] !== undefined) { r.values = r[k]; delete r[k]; }
  r.values = flexValues(r.values);
  for (const k of ['root', 'hierarchy', 'structure']) if (r.tree === undefined && r[k] && typeof r[k] === 'object') { r.tree = r[k]; delete r[k]; }
  if (typeof r.balance === 'boolean') { if (r.balance && r.kind === undefined) r.kind = 'avl'; delete r.balance; }
  if (r.steps === undefined) for (const k of ['actions', 'operations', 'ops']) if (r[k] !== undefined) { r.steps = r[k]; delete r[k]; }
  if (r.steps !== undefined) r.steps = (flexSteps(r.steps, TREE_VERBS, {key: 'value', label: 'value', name: 'value', node: 'value', item: 'value', type: 'order', how: 'order', under: 'parent', of: 'parent'}) as Record<string, unknown>[]).map((s) => {
    if (!s || typeof s !== 'object') return s;
    const o = {...s};
    const raw0 = (s as {do?: string}).do;
    if (o.order === undefined && typeof raw0 === 'string' && o.do === 'traverse') { const a = argsOf(o)[0]; if (typeof a === 'string') o.order = a; }
    if (typeof o.order === 'string') o.order = ORDER_ALIASES[o.order.toLowerCase()] ?? o.order.toLowerCase();
    if (o.value === undefined && Array.isArray(o.args) && o.args.length && o.do !== 'traverse') o.value = argsOf(o)[0];
    if (Array.isArray(o.values) && o.do === 'insert') return o; // expanded below
    return o;
  }).flatMap((s) => (s && typeof s === 'object' && Array.isArray((s as Record<string, unknown>).values) ? ((s as Record<string, unknown>).values as unknown[]).map((v) => ({...s, values: undefined, value: v})) : [s]))
    .map((s) => { if (s && typeof s === 'object') { const o = {...(s as object)} as Record<string, unknown>; if (o.values === undefined) delete o.values; return o; } return s; });
  return r;
};

export const treeSceneSchema = z.preprocess(flexTree, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  kind: z.enum(['bst', 'avl', 'tree']).optional(), // default: tree when "tree" is given, else bst
  values: z.array(z.union([z.number(), z.string().max(10)])).max(15).optional(), // inserted (instantly) at the start
  tree: z.union([z.string().max(18), z.object({label: z.union([z.string().max(18), z.number()]).optional(), children: z.array(z.unknown()).max(8).optional()}).catchall(z.unknown())]).optional(), // {label, children: [...]}
  steps: z.array(stepSchema).max(24).optional(),
  decisionPath: z.array(z.object({at: z.number().min(0).max(1),
    child: z.number().int().nonnegative().optional(), reason: z.string().min(1).max(90)}).strict()).min(1).max(10).optional(),
  showBalance: z.boolean().optional(), // AVL balance factors (default on for avl)
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  if (p.decisionPath) {
    if (!p.tree || (p.kind && p.kind !== 'tree') || p.steps?.length) {
      ctx.addIssue({code:'custom',path:['decisionPath'],message:'Use a static general tree with a decision path.'});
    } else {
      const tree = nestedToTree(p.tree as Nested);
      let current = tree.root;
      p.decisionPath.forEach((entry, i) => {
        if (i && current !== undefined && entry.child !== undefined) current = childrenOf(tree, current)[entry.child];
        if (current === undefined || (i === 0 ? entry.child !== undefined :
          entry.child === undefined || entry.at <= p.decisionPath![i - 1].at)) {
          ctx.addIssue({code:'custom',path:['decisionPath',i],message:'Start at the root, then choose an existing child at each later cue.'});
        }
      });
    }
  }
  (p.steps ?? []).forEach((s, i) => {
    if (!Object.values(TREE_VERBS).includes(s.do)) ctx.addIssue({code: 'custom', path: ['steps', i, 'do'], message: 'use insert, delete, find, traverse (order), visit, note'});
    if (['insert', 'delete', 'find', 'visit'].includes(s.do) && valOf(s, 'value') === undefined) ctx.addIssue({code: 'custom', path: ['steps', i, 'value'], message: `${s.do} needs "value"`});
  });
}));
type TreeProps = z.output<typeof treeSceneSchema>;

export const treeDescription =
  'A tree in the paper style. kind "bst": insert walks down comparing (7 > 5 → right) and the node pops in; "avl": after ' +
  'insert/delete the tree rebalances and nodes glide through each rotation; "tree": any hierarchy given as "tree": ' +
  '{label, children:[...]} (file system, DOM, company or newsroom org chart). Omit steps for a static hierarchy. "values" are inserted at the start in BST/AVL mode; "steps": insert {value, parent ' +
  'for "tree"} | delete {value} | find {value} | traverse {order: inorder|preorder|postorder|bfs} | visit {value} | note. ' +
  'For a decision tree, use decisionPath with at and reason for the root, then add a zero-based child index to each following cue.';
export const treeTags = ['tree', 'decision tree', 'decision path', 'binary tree', 'binary search tree', 'bst', 'avl', 'balanced tree', 'rotation', 'traversal', 'inorder', 'preorder', 'postorder', 'dom', 'hierarchy', 'org chart', 'organization chart', 'newsroom', 'reporting structure', 'dsa', 'recursion', 'file system'];

type TMicro = {kind: 'compare' | 'place' | 'rotate' | 'mark' | 'remove' | 'visit' | 'found' | 'missing' | 'note' | 'clear'; id?: number; note?: string; tree?: Tree; out?: number};
const DEFAULT_TREE_STEPS = (kind: string) => (kind === 'avl' ? [{do: 'insert', value: 10}, {do: 'insert', value: 20}, {do: 'insert', value: 30}, {do: 'insert', value: 25}, {do: 'insert', value: 28}] : [{do: 'insert', value: 6}, {do: 'find', value: 5}, {do: 'traverse', order: 'inorder'}]);

/** Fix the deepest unbalanced node until the tree is balanced; one micro step per rotation. */
const rebalance = (t0: Tree, out: TMicro[]) => {
  let t = t0;
  for (let guard = 0; guard < 8; guard++) {
    const bad = Object.values(t.nodes).filter((n) => Math.abs(bf(t, n.id)) > 1).sort((a, b) => depthOf(t, b.id) - depthOf(t, a.id))[0];
    if (!bad) return t;
    const z0 = bad.id, b0 = bf(t, z0), v = t.nodes[z0].v;
    if (b0 > 1) {
      const l = t.nodes[z0].l!;
      if (bf(t, l) < 0) { t = cloneT(t); rotL(t, l); out.push({kind: 'rotate', id: l, tree: t, note: `${v} is left-heavy with a bend → first rotate ${t.nodes[l].v} left`}); }
      t = cloneT(t); rotR(t, z0); out.push({kind: 'rotate', id: z0, tree: t, note: `${v} is left-heavy (balance ${b0}) → rotate right`});
    } else {
      const r = t.nodes[z0].r!;
      if (bf(t, r) > 0) { t = cloneT(t); rotR(t, r); out.push({kind: 'rotate', id: r, tree: t, note: `${v} is right-heavy with a bend → first rotate ${t.nodes[r].v} right`}); }
      t = cloneT(t); rotL(t, z0); out.push({kind: 'rotate', id: z0, tree: t, note: `${v} is right-heavy (balance ${b0}) → rotate left`});
    }
  }
  return t;
};

const nestedToTree = (n: Nested): Tree => {
  const t: Tree = {nodes: {}};
  let id = 0;
  const go = (x: Nested): number => {
    const me = id++;
    const label = typeof x === 'object' ? (x.label ?? x.value ?? x.name ?? '?') : x;
    const kids = typeof x === 'object' && Array.isArray(x.children) ? x.children : [];
    t.nodes[me] = {id: me, v: label, kids: []};
    t.nodes[me].kids = kids.map(go);
    return me;
  };
  t.root = go(n);
  return t;
};

export const TreeScene: FC<z.input<typeof treeSceneSchema>> = (input) => {
  const p = treeSceneSchema.parse(input) as TreeProps;
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const len = useSceneLength();
  const kind = p.kind ?? (p.tree ? 'tree' : 'bst');
  const generic = kind === 'tree';

  // build the start tree
  let t: Tree = generic ? nestedToTree((p.tree as Nested | undefined) ?? {label: 'root', children: [{label: 'src', children: [{label: 'app.js'}, {label: 'util.js'}]}, {label: 'README.md'}]}) : {nodes: {}};
  let nid = Object.keys(t.nodes).length;
  const find = (tt: Tree, v: V) => Object.values(tt.nodes).find((n) => same(n.v, v));
  const bstInsert = (tt: Tree, v: V, path?: TMicro[]): Tree => {
    const n = cloneT(tt);
    const id = nid++;
    n.nodes[id] = {id, v};
    if (n.root === undefined) { n.root = id; return n; }
    let cur = n.root;
    for (;;) {
      const c = n.nodes[cur], go = cmp(v, c.v) < 0 ? 'l' : 'r';
      path?.push({kind: 'compare', id: cur, note: `${v} ${go === 'l' ? '<' : '≥'} ${c.v} → go ${go === 'l' ? 'left' : 'right'}`});
      if (c[go] === undefined) { c[go] = id; return n; }
      cur = c[go]!;
    }
  };
  // no values: the example tree, unless own steps are given (then they build the tree from empty)
  if (!generic) for (const v of p.values ?? (kind === 'avl' || p.steps ? [] : [8, 3, 10, 1, 5, 14])) { if (!find(t, v)) { t = bstInsert(t, v); if (kind === 'avl') t = rebalance(t, []); } }

  // micro steps
  const micros: TMicro[] = [];
  if (p.decisionPath) {
    let id = t.root!;
    p.decisionPath.forEach(entry => {
      if (entry.child !== undefined) id = childrenOf(t, id)[entry.child];
      micros.push({kind:'visit', id, note:entry.reason, out:id, tree:t});
    });
  }
  const steps = (p.steps ?? (generic ? [] : DEFAULT_TREE_STEPS(kind))) as Step[];
  const start = t;
  for (const s of steps) {
    const v = valOf(s, 'value') ?? (argsOf(s)[0] as V);
    if (s.do === 'note') { micros.push({kind: 'note', note: s.note, tree: t}); continue; }
    if (s.do === 'insert') {
      if (generic) {
        const parent = find(t, valOf(s, 'parent') ?? '') ?? (t.root !== undefined ? t.nodes[t.root] : undefined);
        const n = cloneT(t); const id = nid++;
        n.nodes[id] = {id, v, kids: []};
        if (parent) n.nodes[parent.id].kids = [...(n.nodes[parent.id].kids ?? []), id]; else n.root = id;
        t = n; micros.push({kind: 'place', id, tree: t, note: s.note ?? `add ${v}${parent ? ` under ${parent.v}` : ''}`});
      } else if (find(t, v)) micros.push({kind: 'found', id: find(t, v)!.id, tree: t, note: `${v} is already in the tree`});
      else {
        const path: TMicro[] = [], before = t;
        t = bstInsert(t, v, path);
        path.forEach((m) => micros.push({...m, tree: before}));
        const id = find(t, v)!.id;
        micros.push({kind: 'place', id, tree: t, note: s.note ?? `insert ${v} here`});
        if (kind === 'avl') { const before = micros.length; t = rebalance(t, micros); if (micros.length === before) micros.push({kind: 'note', tree: t, note: 'every node is balanced (-1, 0 or 1) → no rotation'}); }
      }
      continue;
    }
    const node = find(t, v);
    if (s.do === 'visit') { micros.push({kind: 'visit', id: node?.id, tree: t, note: s.note, out: node?.id}); continue; }
    if (s.do === 'traverse') {
      const how = typeof s.order === 'string' ? s.order : generic ? 'preorder' : 'inorder';
      micros.push({kind: 'clear', tree: t, note: s.note ?? `${how === 'bfs' ? 'level-order (BFS)' : how} traversal${how === 'inorder' && !generic ? ': left, node, right' : how === 'preorder' ? ': node first, then children' : how === 'postorder' ? ': children first, then node' : ': level by level'}`});
      for (const id of order(t, how)) micros.push({kind: 'visit', id, tree: t, out: id});
      continue;
    }
    // find / delete: walk down
    if (generic) {
      const path = node ? order(t, 'bfs').slice(0, order(t, 'bfs').indexOf(node.id) + 1) : order(t, 'bfs');
      path.forEach((id) => micros.push({kind: 'compare', id, tree: t}));
    } else if (t.root !== undefined) {
      let cur: number | undefined = t.root;
      while (cur !== undefined && !same(t.nodes[cur].v, v)) { const c: TN = t.nodes[cur]; const go = cmp(v, c.v) < 0 ? 'l' : 'r'; micros.push({kind: 'compare', id: cur, tree: t, note: `${v} ${go === 'l' ? '<' : '>'} ${c.v} → go ${go === 'l' ? 'left' : 'right'}`}); cur = c[go]; }
      if (cur !== undefined) micros.push({kind: 'compare', id: cur, tree: t, note: `${v} = ${v} ✓`});
    }
    if (!node) { micros.push({kind: 'missing', tree: t, note: `${v} is not in the tree`}); continue; }
    if (s.do === 'find') { micros.push({kind: 'found', id: node.id, tree: t, note: s.note ?? `found ${v} in ${depthOf(t, node.id) + 1} step${depthOf(t, node.id) ? 's' : ''}`}); continue; }
    // delete
    micros.push({kind: 'mark', id: node.id, tree: t, note: s.note ?? `delete ${v}`});
    const n = cloneT(t), d = n.nodes[node.id];
    let note: string;
    if (generic) { const drop = (id: number) => { (n.nodes[id].kids ?? []).forEach(drop); delete n.nodes[id]; }; relink(n, d.id, undefined); drop(d.id); note = `${v} and everything under it is removed`; }
    else if (d.l === undefined || d.r === undefined) { relink(n, d.id, d.l ?? d.r); delete n.nodes[d.id]; note = d.l === undefined && d.r === undefined ? `${v} is a leaf → just remove it` : `${v} has one child → the child takes its place`; }
    else {
      let s0 = d.r; while (n.nodes[s0].l !== undefined) s0 = n.nodes[s0].l!;
      const sv = n.nodes[s0].v;
      if (s0 !== d.r) { const sp = parentOf(n, s0)!; sp.l = n.nodes[s0].r; n.nodes[s0].r = d.r; }
      n.nodes[s0].l = d.l;
      relink(n, d.id, s0); delete n.nodes[d.id];
      note = `two children → the next bigger value (${sv}) moves up`;
    }
    t = n; micros.push({kind: 'remove', id: node.id, tree: t, note});
    if (kind === 'avl') t = rebalance(t, micros);
  }
  const trees: Tree[] = [start, ...micros.map((m) => m.tree ?? start)];
  const {starts, dur} = p.decisionPath ? {
    starts:p.decisionPath.map(s=>Math.min(len-1,Math.round(s.at*len))),dur:Math.max(1,Math.round(fps*0.26)),
  } : schedule(micros.length, len, fps, 0.1);
  const {c, k} = playhead(f, starts, dur);
  const prevT = trees[c < 0 ? 0 : c], nextT = trees[c + 1] ?? prevT;
  const cur = c < 0 ? undefined : micros[c];
  const out: number[] = [];
  for (let i = 0; i <= c; i++) { if (micros[i].kind === 'clear') out.length = 0; if (micros[i].out !== undefined && (i < c || k > 0.4)) out.push(micros[i].out!); }
  const note = [...micros.slice(0, c + 1)].reverse().find((m) => m.note)?.note;

  // layout
  const top = 270 * u, bottom = H - (out.length || micros.some((m) => m.out !== undefined) ? 330 : 230) * u;
  const place = (tt: Tree) => {
    const pos = layoutT(tt);
    const vals = Object.values(pos);
    const cols = Math.max(1, ...vals.map((q) => q.x + 1)), depth = Math.max(1, ...vals.map((q) => q.d + 1));
    const span = Math.min(W - (generic ? 150 : 240) * u, cols * (generic ? 290 : 170) * u);
    const lvl = Math.min(150 * u, (bottom - top) / Math.max(1, depth - 0.4));
    const res: Record<number, {x: number; y: number}> = {};
    for (const [id, q] of Object.entries(pos)) res[+id] = {x: W / 2 - span / 2 + (q.x + 0.5) * (span / cols), y: top + 40 * u + q.d * lvl};
    return {res, slot: span / cols, r: Math.min(46 * u, (span / cols) * 0.36, generic ? lvl * 0.39 : Infinity)};
  };
  const A = place(prevT), B = place(nextT);
  const R = lerp(A.r, B.r, k);
  const cardWidth = Math.min(235 * u, lerp(A.slot, B.slot, k) * 0.88);
  const posOf = (id: number) => { const a = A.res[id], b = B.res[id]; return a && b ? {x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k)} : (b ?? a); };
  const ids = new Set([...Object.keys(prevT.nodes), ...Object.keys(nextT.nodes)].map(Number));
  const edges = new Map<string, {a: number; b: number; inA: boolean; inB: boolean}>();
  for (const [tt, key] of [[prevT, 'inA'], [nextT, 'inB']] as const) for (const n of Object.values(tt.nodes)) for (const ch of childrenOf(tt, n.id)) { const e = edges.get(`${n.id}-${ch}`) ?? {a: n.id, b: ch, inA: false, inB: false}; e[key] = true; edges.set(`${n.id}-${ch}`, e); }
  const visited = new Set(out);
  const showBf = (p.showBalance ?? kind === 'avl') && !generic;

  const cues: Cue[] = [];
  if (p.sound) micros.forEach((m, i) => {
    const at = Math.round(starts[i]);
    const snd = {compare: 'tick', place: 'pop', rotate: 'swipe', mark: 'alert', remove: 'remove', visit: 'blip', found: 'success', missing: 'error'}[m.kind as string];
    if (snd) cues.push({sound: snd, at, volume: 0.2});
  });
  const enter = spring({frame: f, fps, config: {damping: 16, stiffness: 110}});
  const tShow = k >= 0.5 ? nextT : prevT;

  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title}>
      <div style={{position: 'absolute', inset: 0, opacity: enter}}>
        <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
          {[...edges.values()].map((e) => {
            const a = posOf(e.a), b = posOf(e.b);
            if (!a || !b) return null;
            const op = e.inA && e.inB ? 1 : e.inB ? k : 1 - k;
            const hot = visited.has(e.a) && visited.has(e.b);
            if (generic) {
              const middle = (a.y+b.y)/2;
              return <path key={`${e.a}-${e.b}`} d={`M ${a.x} ${a.y} V ${middle} H ${b.x} V ${b.y}`}
                fill="none" stroke={hot ? FILL.green : PAPER.inkSoft} strokeWidth={2.4 * u} opacity={op}/>;
            }
            return <line key={`${e.a}-${e.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hot ? FILL.green : PAPER.ink} strokeWidth={(hot ? 4 : 3) * u} opacity={op} />;
          })}
        </svg>
        {[...ids].map((id) => {
          const q = posOf(id);
          const n = nextT.nodes[id] ?? prevT.nodes[id];
          if (!q || !n) return null;
          const isNew = !prevT.nodes[id], gone = !nextT.nodes[id];
          const here = cur?.id === id;
          const fill = gone || (here && cur?.kind === 'mark') ? FILL.red : here && cur?.kind === 'found' ? FILL.found : here && cur?.kind === 'compare' ? FILL.compare : here && cur?.kind === 'rotate' ? '#e3d6ff' : visited.has(id) ? FILL.done : here && cur?.kind === 'place' ? FILL.blue : FILL.item;
          const scale = isNew ? spring({frame: f - starts[c], fps, config: {damping: 11, stiffness: 160}}) : gone ? 1 - k : 1;
          const ring = here && cur?.kind !== 'visit' ? (cur?.kind === 'found' ? 'rgba(63,154,87,0.4)' : cur?.kind === 'rotate' ? 'rgba(138,111,209,0.45)' : 'rgba(255,160,60,0.45)') : undefined;
          const label = show(n.v);
          const w = generic ? cardWidth : R * 2;
          const font = generic ? Math.min(26*u,R*0.64,w/(0.57*Math.min(17,Math.max(6,label.length)))) :
            Math.min(30*u,R*0.8*(label.length>2?2.4/label.length:1));
          const b0 = showBf && tShow.nodes[id] ? bf(tShow, id) : undefined;
          return (
            <div key={id} style={{position: 'absolute', left: q.x - w / 2, top: q.y - R, width: w, height: R * 2,
              borderRadius: generic ? 13 * u : 999, background: generic && fill === FILL.item ? PAPER.card : fill,
              border: `${(generic?2:3) * u}px solid ${generic ? PAPER.inkSoft : PAPER.ink}`, boxSizing: 'border-box',
              display: 'grid', placeItems: 'center', textAlign:'center', lineHeight:1.1, paddingInline:generic?6*u:0,
              fontFamily:generic?PAPER.sans:MONO, fontWeight:800, fontSize:font, transform:`scale(${scale})`,
              boxShadow: ring ? `0 0 0 ${6 * u}px ${ring}` : `0 ${5 * u}px ${10 * u}px rgba(70,50,30,0.14)`,
              overflowWrap:generic?'anywhere':undefined,whiteSpace:generic?'normal':'nowrap'}}>
              {label}
              {b0 !== undefined ? <span style={{position: 'absolute', right: -R * 0.55, top: -R * 0.45, padding: `${1 * u}px ${7 * u}px`, borderRadius: 8 * u, background: Math.abs(b0) > 1 ? '#e5604f' : PAPER.card, color: Math.abs(b0) > 1 ? '#fff' : PAPER.inkSoft, border: `${1.5 * u}px solid ${PAPER.ink}`, fontSize: 15 * u}}>{b0 > 0 ? `+${b0}` : b0}</span> : null}
            </div>
          );
        })}
        {micros.some((m) => m.out !== undefined) ? (
          <div style={{position: 'absolute', left: 100 * u, right: 100 * u, top: H - 300 * u, display: 'flex', alignItems: 'center', gap: 10 * u, flexWrap: 'wrap'}}>
            <span style={{fontWeight: 800, fontSize: 22 * u, color: PAPER.inkSoft, marginRight: 8 * u}}>{p.decisionPath ? 'Decision path' : 'visited:'}</span>
            {out.map((id, i) => <span key={i} style={{padding: `${6 * u}px ${14 * u}px`, borderRadius: 10 * u, background: FILL.done, border: `${2 * u}px solid ${PAPER.ink}`, fontFamily: MONO, fontWeight: 800, fontSize: 22 * u}}>{show((prevT.nodes[id] ?? nextT.nodes[id])?.v)}</span>)}
          </div>
        ) : null}
      </div>
      <NoteBar text={note} cx={W / 2} y={170 * u} u={u} maxW={W - 200 * u} />
      {cues.map((q, i) => <Sfx key={i} sound={q.sound} at={q.at} volume={q.volume} />)}
    </PaperStage>
  );
};

/* ================================================================== graph */
const GRAPH_VERBS: Record<string, string> = {
  bfs: 'bfs', breadthfirst: 'bfs', 'breadth-first': 'bfs', levelorder: 'bfs', dfs: 'dfs', depthfirst: 'dfs', 'depth-first': 'dfs',
  dijkstra: 'dijkstra', shortest: 'dijkstra', shortestpath: 'dijkstra', path: 'path', route: 'path', highlight: 'path', visit: 'visit', mark: 'visit', edge: 'edge', note: 'note', say: 'note',
};
const flexGraph = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = {...(raw as Record<string, unknown>)};
  for (const k of ['vertices', 'vertex', 'points', 'cities', 'people']) if (r.nodes === undefined && r[k] !== undefined) { r.nodes = r[k]; delete r[k]; }
  for (const k of ['links', 'connections', 'arcs', 'roads']) if (r.edges === undefined && r[k] !== undefined) { r.edges = r[k]; delete r[k]; }
  if (r.nodes && !Array.isArray(r.nodes) && typeof r.nodes === 'string') r.nodes = (r.nodes as string).split(/[\s,]+/).filter(Boolean);
  if (Array.isArray(r.nodes)) r.nodes = r.nodes.map((n) => (typeof n === 'string' || typeof n === 'number' ? {id: String(n)} : n && typeof n === 'object' ? (() => { const o = {...(n as Record<string, unknown>)}; if (o.id === undefined) o.id = o.name ?? o.label; if (o.id !== undefined) o.id = String(o.id); if (o.label === o.id) delete o.label; delete o.name; if (Array.isArray(o.at)) { o.x = o.at[0]; o.y = o.at[1]; delete o.at; } return o; })() : n));
  if (r.edges && !Array.isArray(r.edges) && typeof r.edges === 'object') r.edges = Object.entries(r.edges as Record<string, unknown>).flatMap(([a, list]) => (Array.isArray(list) ? list.map((b) => [a, b]) : [])); // adjacency list
  if (Array.isArray(r.edges)) r.edges = r.edges.map((e) => {
    if (typeof e === 'string') { const m = e.split(/\s*(?:->|→|--|-|,|\s)\s*/).filter(Boolean); return {from: m[0], to: m[1], ...(m[2] !== undefined && !Number.isNaN(Number(m[2])) ? {weight: Number(m[2])} : {})}; }
    if (Array.isArray(e)) return {from: String(e[0]), to: String(e[1]), ...(typeof e[2] === 'number' ? {weight: e[2]} : {})};
    if (e && typeof e === 'object') { const o = {...(e as Record<string, unknown>)}; for (const [a, b] of [['source', 'from'], ['target', 'to'], ['a', 'from'], ['b', 'to'], ['cost', 'weight'], ['distance', 'weight'], ['w', 'weight']]) if (o[b] === undefined && o[a] !== undefined) { o[b] = o[a]; delete o[a]; } if (o.from !== undefined) o.from = String(o.from); if (o.to !== undefined) o.to = String(o.to); return o; }
    return e;
  });
  if (!r.nodes && Array.isArray(r.edges)) { const ids: string[] = []; (r.edges as {from?: string; to?: string}[]).forEach((e) => [e?.from, e?.to].forEach((x) => { if (x !== undefined && !ids.includes(x)) ids.push(x); })); if (ids.length) r.nodes = ids.map((id) => ({id})); }
  if (typeof r.directed === 'string') r.directed = r.directed === 'true' || r.directed === 'directed';
  if (r.steps === undefined) for (const k of ['actions', 'operations', 'ops']) if (r[k] !== undefined) { r.steps = r[k]; delete r[k]; }
  for (const k of ['algorithm', 'traversal', 'search']) if (r.steps === undefined && typeof r[k] === 'string') { r.steps = [{do: r[k], from: r.start ?? r.source, to: r.goal ?? r.target}]; delete r[k]; }
  delete r.start; delete r.source; delete r.goal; delete r.target;
  if (r.steps !== undefined) r.steps = (flexSteps(r.steps, GRAPH_VERBS, {start: 'from', source: 'from', root: 'from', goal: 'to', target: 'to', end: 'to', node: 'value', id: 'value'}) as Record<string, unknown>[]).map((s) => {
    if (!s || typeof s !== 'object') return s;
    const o = {...s};
    const a = argsOf(o);
    if (o.from === undefined && a[0] !== undefined && ['bfs', 'dfs', 'dijkstra'].includes(o.do as string)) o.from = String(a[0]);
    if (o.to === undefined && a[1] !== undefined && o.do === 'dijkstra') o.to = String(a[1]);
    if (o.from !== undefined) o.from = String(o.from);
    if (o.to !== undefined) o.to = String(o.to);
    return o;
  });
  return r;
};

const EXAMPLE_GRAPH = {
  nodes: ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => ({id})),
  edges: [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['C', 'E'], ['D', 'F'], ['E', 'F']].map(([from, to]) => ({from, to})),
};

const nodeSchema = z.object({id: z.string().max(16), label: z.string().max(18).optional(), x: z.number().optional(), y: z.number().optional()}).strict();
export const graphSceneSchema = z.preprocess(flexGraph, z.object({
  eyebrow: z.string().max(40).optional(),
  title: z.string().max(70).optional(),
  nodes: z.array(nodeSchema).min(2).max(12).default(EXAMPLE_GRAPH.nodes),
  edges: z.array(z.object({from: z.string(), to: z.string(), weight: z.number().optional()}).strict()).max(24).default(EXAMPLE_GRAPH.edges),
  directed: z.boolean().default(false),
  steps: z.array(stepSchema).max(12).default([{do: 'bfs', from: 'A'}]),
  sound: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  const ids = new Set(p.nodes.map((n) => n.id));
  p.edges.forEach((e, i) => { for (const k of ['from', 'to'] as const) if (!ids.has(e[k])) ctx.addIssue({code: 'custom', path: ['edges', i, k], message: `unknown node "${e[k]}"; nodes are: ${[...ids].join(', ')}`}); });
  p.steps.forEach((s, i) => {
    if (!Object.values(GRAPH_VERBS).includes(s.do)) ctx.addIssue({code: 'custom', path: ['steps', i, 'do'], message: 'use bfs, dfs, dijkstra, path, visit, edge, note'});
    for (const k of ['from', 'to', 'value']) { const v = s[k]; if (typeof v === 'string' && !ids.has(v)) ctx.addIssue({code: 'custom', path: ['steps', i, k], message: `unknown node "${v}"`}); }
    if (Array.isArray(s.nodes)) (s.nodes as unknown[]).forEach((v) => { if (!ids.has(String(v))) ctx.addIssue({code: 'custom', path: ['steps', i, 'nodes'], message: `unknown node "${v}"`}); });
    if (s.do === 'dijkstra' && p.edges.some((e) => e.weight !== undefined && e.weight < 0)) ctx.addIssue({code: 'custom', path: ['edges'], message: 'Dijkstra needs weights >= 0'});
  });
}));
type GraphProps = z.output<typeof graphSceneSchema>;

export const graphDescription =
  'A graph in the paper style: "nodes" (strings are fine; optional x/y), "edges" ([from, to, weight?] or "A-B"), "directed". ' +
  '"steps": bfs {from} spreads level by level with the queue shown; dfs {from} goes deep and backtracks with the stack ' +
  'shown; dijkstra {from, to} settles the nearest node, relaxes edges (distances on nodes) and lights the shortest path; ' +
  'path {nodes:[...]}, visit {value}, edge {from,to}, note. Use for maps/routes, social networks, dependencies, web crawling.';
export const graphTags = ['graph', 'bfs', 'dfs', 'breadth first search', 'depth first search', 'dijkstra', 'shortest path', 'traversal', 'nodes and edges', 'network', 'dsa', 'routing', 'social network'];

type GMicro = {kind: 'visit' | 'discover' | 'back' | 'relax' | 'path' | 'note' | 'start'; node?: string; edge?: [string, string]; note?: string; frontier: string[]; dist?: Record<string, number>; path?: string[]; label: string};
type GState = {visited: string[]; current?: string; tree: Set<string>; frontier: string[]; dist: Record<string, number>; path: string[]; label: string};
const ek = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const GraphScene: FC<z.input<typeof graphSceneSchema>> = (input) => {
  const p = graphSceneSchema.parse(input) as GraphProps;
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const u = useUnit();
  const len = useSceneLength();
  const ids = p.nodes.map((n) => n.id);
  const nb = (a: string) => p.edges.flatMap((e) => (e.from === a ? [e.to] : !p.directed && e.to === a ? [e.from] : []));
  const wOf = (a: string, b: string) => p.edges.find((e) => (e.from === a && e.to === b) || (!p.directed && e.from === b && e.to === a))?.weight ?? 1;

  const micros: GMicro[] = [];
  for (const s of p.steps as Step[]) {
    const from = (s.from as string) ?? ids[0];
    if (s.do === 'bfs') {
      const seen = new Set([from]); const q = [from];
      micros.push({kind: 'start', node: from, frontier: [...q], label: 'Queue (BFS)', note: s.note ?? `start at ${from}: put it in the queue`});
      while (q.length) {
        const x = q.shift()!;
        micros.push({kind: 'visit', node: x, frontier: [...q], label: 'Queue (BFS)', note: `take ${x} from the front → visit it`});
        for (const w of nb(x)) if (!seen.has(w)) { seen.add(w); q.push(w); micros.push({kind: 'discover', node: w, edge: [x, w], frontier: [...q], label: 'Queue (BFS)', note: `${w} is new → add to the back of the queue`}); }
      }
    } else if (s.do === 'dfs') {
      const seen = new Set<string>(); const stack: string[] = [];
      const go = (x: string, parent?: string) => {
        seen.add(x); stack.push(x);
        micros.push({kind: 'visit', node: x, edge: parent ? [parent, x] : undefined, frontier: [...stack], label: 'Stack (DFS)', note: parent ? `go deeper: ${parent} → ${x}` : s.note ?? `start at ${x}`});
        for (const w of nb(x)) if (!seen.has(w)) go(w, x);
        stack.pop();
        if (stack.length) micros.push({kind: 'back', node: stack[stack.length - 1], frontier: [...stack], label: 'Stack (DFS)', note: `${x} has no new neighbours → back to ${stack[stack.length - 1]}`});
      };
      go(from);
    } else if (s.do === 'dijkstra') {
      const dist: Record<string, number> = Object.fromEntries(ids.map((i) => [i, Infinity])); dist[from] = 0;
      const prevN: Record<string, string> = {}; const done = new Set<string>();
      const pq = () => ids.filter((i) => !done.has(i) && dist[i] < Infinity).sort((a, b) => dist[a] - dist[b]);
      micros.push({kind: 'start', node: from, frontier: pq(), dist: {...dist}, label: 'Nearest first', note: s.note ?? `distance to ${from} is 0, everything else ∞`});
      while (pq().length) {
        const x = pq()[0]; done.add(x);
        micros.push({kind: 'visit', node: x, frontier: pq(), dist: {...dist}, label: 'Nearest first', note: `${x} is the closest not-done node (${dist[x]}) → its distance is final`});
        if (s.to && x === s.to) break;
        for (const w of nb(x)) if (!done.has(w)) {
          const nd = dist[x] + wOf(x, w);
          const better = nd < dist[w];
          if (better) { dist[w] = nd; prevN[w] = x; }
          micros.push({kind: 'relax', node: w, edge: [x, w], frontier: pq(), dist: {...dist}, label: 'Nearest first', note: `${x} → ${w}: ${dist[x]} + ${wOf(x, w)} = ${nd}${better ? ' → shorter, update' : ` ≥ ${dist[w]} → keep`}`});
        }
      }
      const to = s.to as string | undefined;
      if (to && dist[to] < Infinity) { const path = [to]; while (path[0] !== from) path.unshift(prevN[path[0]]); micros.push({kind: 'path', path, frontier: [], dist: {...dist}, label: 'Nearest first', note: `shortest ${from} → ${to}: ${path.join(' → ')} (${dist[to]})`}); }
    } else if (s.do === 'path') {
      const path = (Array.isArray(s.nodes) ? (s.nodes as unknown[]) : argsOf(s)).map(String);
      micros.push({kind: 'path', path, frontier: [], label: '', note: s.note ?? path.join(' → ')});
    } else if (s.do === 'visit') micros.push({kind: 'visit', node: String(valOf(s, 'value') ?? argsOf(s)[0]), frontier: [], label: '', note: s.note});
    else if (s.do === 'edge') micros.push({kind: 'discover', edge: [String(s.from), String(s.to)], frontier: [], label: '', note: s.note});
    else micros.push({kind: 'note', frontier: [], label: '', note: s.note});
  }
  const states: GState[] = [{visited: [], tree: new Set(), frontier: [], dist: {}, path: [], label: ''}];
  for (const m of micros) {
    const s = states[states.length - 1];
    const n: GState = {...s, visited: [...s.visited], tree: new Set(s.tree), frontier: m.kind === 'note' ? s.frontier : m.frontier, dist: m.dist ?? s.dist, path: m.path ?? s.path, label: m.label || s.label};
    if (m.kind === 'start') { n.visited = []; n.tree = new Set(); n.path = []; }
    if (m.kind === 'visit' && m.node) { if (!n.visited.includes(m.node)) n.visited.push(m.node); n.current = m.node; }
    if (m.kind === 'back') n.current = m.node;
    if (m.edge && (m.kind === 'discover' || m.kind === 'visit' || (m.kind === 'relax' && m.dist && m.dist[m.edge[1]] !== s.dist[m.edge[1]]))) n.tree.add(ek(...m.edge));
    states.push(n);
  }
  const {starts, dur} = schedule(micros.length, len, fps, 0.1);
  const {c, k} = playhead(f, starts, dur);
  const prev = states[c < 0 ? 0 : c], next = states[c + 1] ?? prev;
  const cur = c < 0 ? undefined : micros[c];
  const st = k >= 0.5 ? next : prev;
  const note = [...micros.slice(0, c + 1)].reverse().find((m) => m.note)?.note;

  // layout
  const hasFrontier = micros.some((m) => m.frontier.length);
  const panelW = hasFrontier ? Math.min(300 * u, W * 0.2) : 0;
  const box = {x: 130 * u, y: 260 * u, w: W - 260 * u - (panelW ? panelW + 110 * u : 0), h: H - 260 * u - 310 * u};
  const pos: Record<string, {x: number; y: number}> = {};
  if (p.nodes.every((n) => n.x !== undefined && n.y !== undefined)) {
    const xs = p.nodes.map((n) => n.x!), ys = p.nodes.map((n) => n.y!);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    p.nodes.forEach((n) => { pos[n.id] = {x: box.x + (x1 > x0 ? (n.x! - x0) / (x1 - x0) : 0.5) * box.w, y: box.y + (y1 > y0 ? (n.y! - y0) / (y1 - y0) : 0.5) * box.h}; });
  } else {
    const depth: Record<string, number> = {[ids[0]]: 0}; const q = [ids[0]];
    const und = (a: string) => p.edges.flatMap((e) => (e.from === a ? [e.to] : e.to === a ? [e.from] : []));
    while (q.length) { const x = q.shift()!; for (const w of und(x)) if (depth[w] === undefined) { depth[w] = depth[x] + 1; q.push(w); } }
    let extra = Math.max(0, ...Object.values(depth)) + 1;
    ids.forEach((i) => { if (depth[i] === undefined) depth[i] = extra++; });
    const cols = Math.max(...Object.values(depth)) + 1;
    for (let d = 0; d < cols; d++) {
      const col = ids.filter((i) => depth[i] === d);
      col.forEach((i, j) => { pos[i] = {x: box.x + (cols === 1 ? 0.5 : d / (cols - 1)) * box.w, y: box.y + ((j + 0.5) / col.length) * box.h + (col.length > 1 && d % 2 ? box.h * 0.06 : 0)}; });
    }
  }
  const R = Math.min(48 * u, box.w / 14);
  const onPath = (a: string, b: string) => st.path.some((x, i) => i && ((st.path[i - 1] === a && x === b) || (!p.directed && st.path[i - 1] === b && x === a)));
  const cues: Cue[] = [];
  if (p.sound) micros.forEach((m, i) => {
    const at = Math.round(starts[i]);
    const snd = {visit: 'blip', discover: 'connect', relax: 'tick', back: 'swipe', path: 'success', start: 'pop'}[m.kind as string];
    if (snd) cues.push({sound: snd, at, volume: 0.2});
  });
  const enter = spring({frame: f, fps, config: {damping: 16, stiffness: 110}});
  const fmt = (d: number | undefined) => (d === undefined ? '' : d === Infinity ? '∞' : String(d));

  return (
    <PaperStage eyebrow={p.eyebrow} title={p.title}>
      <div style={{position: 'absolute', inset: 0, opacity: enter}}>
        <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
          {p.edges.map((e, i) => {
            const a = pos[e.from], b = pos[e.to];
            const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
            const x1 = a.x + (dx / d) * R, y1 = a.y + (dy / d) * R, x2 = b.x - (dx / d) * (R + 4 * u), y2 = b.y - (dy / d) * (R + 4 * u);
            const isNew = cur?.edge && ek(...cur.edge) === ek(e.from, e.to);
            const inTree = st.tree.has(ek(e.from, e.to)), path = onPath(e.from, e.to);
            const color = path ? FILL.green : isNew ? FILL.accent : inTree ? '#c98a3d' : PAPER.ink;
            const grow = isNew && !prev.tree.has(ek(e.from, e.to)) ? k : 1;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            return (
              <g key={i}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={PAPER.ink} strokeOpacity={0.35} strokeWidth={3 * u} />
                {color !== PAPER.ink ? <line x1={x1} y1={y1} x2={lerp(x1, x2, grow)} y2={lerp(y1, y2, grow)} stroke={color} strokeWidth={(path ? 8 : 6) * u} strokeLinecap="round" /> : null}
                {p.directed ? <path d={arrowHead(x1, y1, x2, y2, 18 * u)} fill={color === PAPER.ink ? 'rgba(43,40,51,0.6)' : color} /> : null}
                {e.weight !== undefined ? <g><rect x={mx - 20 * u} y={my - 17 * u} width={40 * u} height={34 * u} rx={8 * u} fill={PAPER.card} stroke={PAPER.ink} strokeWidth={1.5 * u} /><text x={mx} y={my + 7 * u} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={19 * u} fill={PAPER.ink}>{e.weight}</text></g> : null}
              </g>
            );
          })}
        </svg>
        {p.nodes.map((n) => {
          const q = pos[n.id];
          const isCur = st.current === n.id, vis = st.visited.includes(n.id), inF = st.frontier.includes(n.id), path = st.path.includes(n.id);
          const flash = cur?.node === n.id;
          const fill = path ? FILL.found : isCur ? FILL.compare : vis ? FILL.done : inF ? FILL.blue : FILL.item;
          const label = n.label ?? n.id;
          const d = st.dist[n.id];
          return (
            <div key={n.id}>
              <div style={{position: 'absolute', left: q.x - R, top: q.y - R, width: R * 2, height: R * 2, borderRadius: 999, background: fill, border: `${3 * u}px solid ${PAPER.ink}`, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontWeight: 800, fontSize: Math.min(30 * u, (R * 1.6) / Math.max(1.4, label.length * 0.62)), boxShadow: flash || isCur ? `0 0 0 ${7 * u}px rgba(255,160,60,${flash ? 0.25 + 0.3 * Math.sin(Math.PI * k) : 0.3})` : `0 ${5 * u}px ${10 * u}px rgba(70,50,30,0.14)`, whiteSpace: 'nowrap'}}>{label}</div>
              {d !== undefined ? <div style={{position: 'absolute', left: q.x + R * 0.55, top: q.y - R - 26 * u}}><span style={{padding: `${2 * u}px ${10 * u}px`, borderRadius: 8 * u, background: d === Infinity ? PAPER.card : '#fff1d6', border: `${1.5 * u}px solid ${PAPER.ink}`, fontFamily: MONO, fontWeight: 800, fontSize: 19 * u, color: d === Infinity ? PAPER.inkSoft : PAPER.ink}}>{fmt(d)}</span></div> : null}
            </div>
          );
        })}
        {hasFrontier ? (
          <Panel x={W - 90 * u - panelW} y={250 * u} w={panelW} h={Math.min(H - 560 * u, 100 * u + Math.max(1, ...micros.map((m) => m.frontier.length)) * 66 * u)} u={u} label={st.label || prev.label || 'Frontier'} tint="#e3eefa">
            {st.frontier.map((id, i) => (
              <div key={`${id}-${i}`} style={{position: 'absolute', left: 16 * u, right: 16 * u, top: 58 * u + i * 62 * u, height: 52 * u, borderRadius: 12 * u, background: FILL.blue, border: `${2 * u}px solid ${PAPER.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${14 * u}px`, fontFamily: MONO, fontWeight: 800, fontSize: 22 * u}}>
                <span>{id}</span>{st.dist[id] !== undefined ? <span style={{color: PAPER.inkSoft, fontSize: 18 * u}}>{fmt(st.dist[id])}</span> : i === 0 && st.label.startsWith('Queue') ? <span style={{fontSize: 15 * u, color: PAPER.inkSoft}}>front</span> : i === st.frontier.length - 1 && st.label.startsWith('Stack') ? <span style={{fontSize: 15 * u, color: PAPER.inkSoft}}>top</span> : null}
              </div>
            ))}
          </Panel>
        ) : null}
        <div style={{position: 'absolute', left: 100 * u, right: 100 * u, top: H - 290 * u, display: 'flex', alignItems: 'center', gap: 10 * u, opacity: st.visited.length ? 1 : 0}}>
          <span style={{fontWeight: 800, fontSize: 22 * u, color: PAPER.inkSoft, marginRight: 8 * u}}>visited:</span>
          {st.visited.map((id, i) => <span key={i} style={{padding: `${6 * u}px ${14 * u}px`, borderRadius: 10 * u, background: FILL.done, border: `${2 * u}px solid ${PAPER.ink}`, fontFamily: MONO, fontWeight: 800, fontSize: 22 * u}}>{id}</span>)}
        </div>
      </div>
      <NoteBar text={note} cx={W / 2} y={170 * u} u={u} maxW={W - 200 * u} k={clamp01(k + (c >= 0 ? 1 : 0))} />
      {cues.map((q, i) => <Sfx key={i} sound={q.sound} at={q.at} volume={q.volume} />)}
    </PaperStage>
  );
};
