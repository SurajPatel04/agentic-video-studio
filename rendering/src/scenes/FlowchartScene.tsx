import {useCurrentFrame} from 'remotion';
import {useId} from 'react';
import dagre from '@dagrejs/dagre';
import {z} from 'zod';
import {StudyFrame} from '../components/StudyFrame';
import {useTheme} from '../theme';

const nonnegative = z.number().int().nonnegative();
const positive = z.number().int().positive();

const nodeSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  detail: z.string().optional(),
  kind: z.enum(['start', 'process', 'decision', 'end']).default('process'),
});

export const flowchartSceneSchema = z.object({
  title: z.string().default('How a prompt becomes a video'),
  eyebrow: z.string().default('FLOWCHART / FOLLOW THE PATH'),
  direction: z.enum(['horizontal', 'vertical']).default('horizontal'),
  nodes: z.array(nodeSchema).min(2).max(10).default([
    {id: 'prompt', label: 'User prompt', detail: 'A topic, notes, or a PDF', kind: 'start'},
    {id: 'planner', label: 'Planner', detail: 'Writes the script and picks scenes', kind: 'process'},
    {id: 'exists', label: 'Component exists?', detail: 'Search the shared registry', kind: 'decision'},
    {id: 'compose', label: 'Compose JSON', detail: 'Durations, props, transitions', kind: 'process'},
    {id: 'done', label: 'MP4 delivered', detail: 'Rendered, uploaded, and returned as a URL', kind: 'end'},
  ]),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    label: z.string().optional(),
  })).min(1).max(14).default([
    {from: 'prompt', to: 'planner'},
    {from: 'planner', to: 'exists'},
    {from: 'exists', to: 'compose', label: 'match'},
    {from: 'compose', to: 'done'},
  ]),
  startAt: nonnegative.default(10),
  stagger: nonnegative.default(14),
  revealFrames: positive.default(16),
  footer: z.string().default(''),
}).superRefine((p, ctx) => {
  const ids = new Set(p.nodes.map((n) => n.id));
  const duplicates = p.nodes.map((n) => n.id).filter((id, i, all) => all.indexOf(id) !== i);
  if (duplicates.length) ctx.addIssue({code: 'custom', path: ['nodes'], message: `Duplicate node ids: ${[...new Set(duplicates)].join(', ')}`});
  p.edges.forEach((edge, i) => {
    if (!ids.has(edge.from)) ctx.addIssue({code: 'custom', path: ['edges', i, 'from'], message: `Unknown node "${edge.from}"`});
    if (!ids.has(edge.to)) ctx.addIssue({code: 'custom', path: ['edges', i, 'to'], message: `Unknown node "${edge.to}"`});
    if (edge.from === edge.to) ctx.addIssue({code: 'custom', path: ['edges', i], message: 'An edge cannot point to its own node'});
  });
});

export const description = 'A dagre-laid-out flowchart with start, process, decision, and end nodes, labeled edges, and animated reveals.';
export const tags = ['flowchart', 'diagram', 'process', 'decision', 'dagre', 'system'];

const clamp = (value: number) => Math.min(1, Math.max(0, value));

type Pt = {x: number; y: number};

export const FlowchartScene: React.FC<z.input<typeof flowchartSceneSchema>> = (input) => {
  const p = flowchartSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const theme = useTheme();
  const markerId = `flow-arrow-${useId().replace(/:/g, '')}`;

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: p.direction === 'horizontal' ? 'LR' : 'TB',
    nodesep: 28,
    ranksep: 70,
    marginx: 20,
    marginy: 20,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of p.nodes) graph.setNode(node.id, {width: 320, height: node.detail ? 180 : 130});
  for (const edge of p.edges) graph.setEdge(edge.from, edge.to, edge.label
    ? {labelpos: 'c', width: 140, height: 76} : {});
  dagre.layout(graph);

  // A long linear explanation reads better as two rows than a tiny five-box strip.
  // Only fold genuine chains; branching and vertical graphs retain dagre routing.
  const folded = p.direction === 'horizontal' && p.nodes.length >= 4 && p.nodes.length <= 6 &&
    p.edges.length === p.nodes.length - 1 && p.nodes.slice(1).every((node, i) =>
      p.edges.some((edge) => edge.from === p.nodes[i].id && edge.to === node.id));
  if (folded) {
    const columns = Math.ceil(p.nodes.length / 2);
    p.nodes.forEach((node, i) => {
      const row = Math.floor(i / columns);
      const column = row === 0 ? i : columns - 1 - (i % columns);
      Object.assign(graph.node(node.id), {x: 180 + column * 480, y: 110 + row * 290, width: 340, height: 190});
    });
    p.edges.forEach((edge) => {
      const a = graph.node(edge.from), b = graph.node(edge.to);
      const across = a.y === b.y;
      const sign = b.x > a.x ? 1 : -1;
      const points = across
        ? [{x: a.x + sign * a.width / 2, y: a.y}, {x: b.x - sign * b.width / 2, y: b.y}]
        : [{x: a.x, y: a.y + a.height / 2}, {x: b.x, y: b.y - b.height / 2}];
      Object.assign(graph.edge(edge.from, edge.to), {points, x: across ? (a.x + b.x) / 2 : a.x + 95,
        y: across ? a.y - 36 : (a.y + b.y) / 2, width: across ? 126 : 160, height: 76});
    });
  }

  const laidOut = p.nodes.map((node) => {
    const pos = graph.node(node.id) as {x: number; y: number; width: number; height: number};
    return {...node, x: pos.x, y: pos.y, width: pos.width, height: pos.height};
  });
  const minX = Math.min(...laidOut.map((n) => n.x - n.width / 2));
  const maxX = Math.max(...laidOut.map((n) => n.x + n.width / 2));
  const minY = Math.min(...laidOut.map((n) => n.y - n.height / 2));
  const maxY = Math.max(...laidOut.map((n) => n.y + n.height / 2));
  const graphW = Math.max(1, maxX - minX);
  const graphH = Math.max(1, maxY - minY);
  const scale = Math.min(1360 / graphW, 500 / graphH, 1.08);
  const offsetX = (1440 - graphW * scale) / 2 - minX * scale;
  const offsetY = (510 - graphH * scale) / 2 - minY * scale;

  const kindStyle = (kind: string) => {
    if (kind === 'start') return {border: theme.accent, background: `${theme.accent}20`, color: theme.accent};
    if (kind === 'end') return {border: '#34d399', background: '#34d39920', color: '#35784e'};
    if (kind === 'decision') return {border: '#fbbf24', background: '#fbbf2418', color: '#825716'};
    return {border: '#35576f', background: '#fffaf1', color: theme.text};
  };

  return (
    <StudyFrame title={p.title} eyebrow={p.eyebrow} footer={p.footer || undefined}>
      <div style={{position: 'absolute', inset: 0}}>
        <div style={{position: 'absolute', left: offsetX, top: offsetY, width: graphW, height: graphH, transform: `scale(${scale})`, transformOrigin: 'top left'}}>
          <svg width={graphW} height={graphH} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
            <defs>
              <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b8ca3" />
              </marker>
            </defs>
            {p.edges.map((edge, i) => {
              const layout = graph.edge(edge.from, edge.to) as {points: Pt[]; x?: number; y?: number; width?: number; height?: number};
              const points = layout.points;
              const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
              const sourceIndex = p.nodes.findIndex((n) => n.id === edge.from);
              const progress = clamp((frame - p.startAt - (sourceIndex + 1) * p.stagger) / p.revealFrames);
              const mid = points[Math.floor(points.length / 2)];
              return (
                <g key={`${edge.from}-${edge.to}-${i}`} opacity={progress}>
                  <path
                    d={d}
                    fill="none"
                    stroke="#6b8ca3"
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    markerEnd={`url(#${markerId})`}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - progress}
                  />
                  {edge.label ? (
                    <foreignObject x={(layout.x ?? mid.x) - (layout.width ?? 140) / 2}
                      y={(layout.y ?? mid.y) - 38} width={layout.width ?? 140} height={76} opacity={progress}>
                      <div style={{height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        <div style={{padding: '6px 8px', background: '#fffaf1', border: '1px solid #324658', borderRadius: 9,
                          color: '#514b59', textAlign: 'center', fontSize: 17, lineHeight: 1.25, overflowWrap: 'anywhere'}}>{edge.label}</div>
                      </div>
                    </foreignObject>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {laidOut.map((node, i) => {
            const reveal = clamp((frame - p.startAt - i * p.stagger) / p.revealFrames);
            const style = kindStyle(node.kind);
            return (
              <div
                key={node.id}
                style={{
                  position: 'absolute',
                  left: node.x - node.width / 2,
                  top: node.y - node.height / 2,
                  width: node.width,
                  height: node.height,
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  textAlign: 'center',
                  padding: '22px 24px',
                  borderRadius: 20,
                  border: `2px solid ${style.border}`,
                  background: style.background,
                  opacity: reveal,
                  transform: `translateY(${(1 - reveal) * 14}px)`,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                }}
              >
                <div style={{fontSize: 13, fontWeight: 800, letterSpacing: 2, color: style.color, marginBottom: 10}}>{String(i + 1).padStart(2, '0')}</div>
                <div style={{fontSize: node.label.length > 45 ? 23 : 27, lineHeight: 1.15, fontWeight: 700, color: style.color, overflowWrap: 'anywhere'}}>{node.label}</div>
                {node.detail ? <div style={{fontSize: 20, lineHeight: 1.3, color: '#514b59', marginTop: 12, overflowWrap: 'anywhere'}}>{node.detail}</div> : null}
              </div>
            );
          })}
        </div>
      </div>
    </StudyFrame>
  );
};
