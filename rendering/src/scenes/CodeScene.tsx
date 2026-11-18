import {PAPER} from '../iso/iso';
import {useCurrentFrame} from 'remotion';
import type {ReactNode} from 'react';
import {z} from 'zod';
import {StudyFrame} from '../components/StudyFrame';
import {useTheme} from '../theme';

const nonnegative = z.number().int().nonnegative();
const positive = z.number().int().positive();

export const codeSceneSchema = z.object({
  title: z.string().default('A recursive function'),
  eyebrow: z.string().default('CODE / READ IT LINE BY LINE'),
  filename: z.string().default('factorial.py'),
  language: z.string().default('python'),
  code: z.string().default('def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)\n\nprint(factorial(5))'),
  startAt: nonnegative.default(10),
  lineStagger: nonnegative.default(5),
  revealFrames: positive.default(10),
  highlightLines: z.array(z.number().int().positive()).max(12).default([3, 4]),
  showLineNumbers: z.boolean().default(true),
  fontSize: z.number().positive().default(32),
  footer: z.string().default('Line numbers and highlights draw attention to the part that matters.'),
}).superRefine((p, ctx) => {
  if (p.code.split('\n').length > 26) ctx.addIssue({code: 'custom', path: ['code'], message: 'Keep code to 26 lines or fewer so it fits the frame'});
  p.highlightLines.forEach((line, i) => {
    if (line > p.code.split('\n').length) ctx.addIssue({code: 'custom', path: ['highlightLines', i], message: `Line ${line} is outside the code block`});
  });
});

export const description = 'A syntax-highlighted code snippet with line numbers, line-by-line reveals, and highlighted lines.';
export const tags = ['code', 'programming', 'syntax', 'algorithm', 'computer science'];

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'from', 'export', 'default',
  'async', 'await', 'try', 'catch', 'finally', 'throw', 'new', 'typeof', 'instanceof', 'in', 'of', 'interface', 'type',
  'extends', 'implements', 'public', 'private', 'protected', 'static', 'readonly', 'enum', 'def', 'lambda', 'print',
  'elif', 'with', 'as', 'pass', 'break', 'continue', 'True', 'False', 'None', 'self', 'and', 'or', 'not', 'is', 'yield',
  'match', 'case', 'raise', 'global', 'nonlocal', 'assert', 'del', 'void', 'int', 'float', 'string', 'bool', 'double',
]);

const TOKEN = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g;

const tokenColor = (token: string, rest: string, theme: ReturnType<typeof useTheme>): string | null => {
  if (token.startsWith('//') || token.startsWith('#') || token.startsWith('/*')) return PAPER.inkSoft;
  if (token.startsWith("'") || token.startsWith('"') || token.startsWith('`')) return '#376a46';
  if (/^\d/.test(token)) return '#a24a35';
  if (KEYWORDS.has(token)) return '#72539c';
  if (/^[A-Z]/.test(token)) return '#81591c';
  if (rest.trimStart().startsWith('(')) return '#315d8b';
  return theme.text;
};

const highlight = (line: string, theme: ReturnType<typeof useTheme>): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(line)) !== null) {
    if (match.index > cursor) nodes.push(<span key={`plain-${cursor}`}>{line.slice(cursor, match.index)}</span>);
    const token = match[0];
    const color = tokenColor(token, line.slice(match.index + token.length), theme);
    nodes.push(<span key={`token-${match.index}`} style={{color: color ?? undefined}}>{token}</span>);
    cursor = match.index + token.length;
  }
  if (cursor < line.length) nodes.push(<span key={`plain-${cursor}`}>{line.slice(cursor)}</span>);
  return nodes.length ? nodes : [' '];
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export const CodeScene: React.FC<z.input<typeof codeSceneSchema>> = (input) => {
  const p = codeSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const theme = useTheme();
  const lines = p.code.replace(/\t/g, '    ').split('\n');
  const longest = Math.max(...lines.map((line) => line.length), 1);
  const fittedByWidth = 1110 / Math.max(12, longest * 0.62);
  const fittedByHeight = (385 / Math.max(lines.length, 1)) * 1.12;
  const fontSize = Math.max(15, Math.min(p.fontSize, fittedByWidth, fittedByHeight));
  const highlighted = new Set(p.highlightLines.map((line) => line - 1));

  return (
    <StudyFrame title={p.title} eyebrow={p.eyebrow} footer={p.footer || undefined}>
      <div style={{height: '100%', display: 'flex', flexDirection: 'column', border: `1px solid ${PAPER.track}`, borderRadius: 18, overflow: 'hidden', background: PAPER.card}}>
        <div style={{height: 56, flex: '0 0 56px', display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', background: PAPER.track, borderBottom: `1px solid ${PAPER.track}`}}>
          <span style={{width: 12, height: 12, borderRadius: '50%', background: '#ff6b6b'}} />
          <span style={{width: 12, height: 12, borderRadius: '50%', background: '#fbbf24'}} />
          <span style={{width: 12, height: 12, borderRadius: '50%', background: '#34d399'}} />
          <span style={{marginLeft: 8, fontSize: 19, color: theme.muted}}>{p.filename}</span>
          <span style={{marginLeft: 'auto', padding: '5px 12px', borderRadius: 999, border: `1px solid ${PAPER.inkSoft}`, fontSize: 15, letterSpacing: 1.4, textTransform: 'uppercase', color: theme.accent}}>{p.language}</span>
        </div>

        <div style={{flex: 1, padding: '14px 0', fontFamily: "'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Consolas, monospace", overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
          {lines.map((line, i) => {
            const reveal = clamp((frame - p.startAt - i * p.lineStagger) / p.revealFrames);
            const isHighlighted = highlighted.has(i);
            return (
              <div
                key={`${i}-${line}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  minHeight: fontSize * 1.45,
                  padding: '0 20px 0 0',
                  background: isHighlighted ? `${theme.accent}16` : 'transparent',
                  borderLeft: `4px solid ${isHighlighted ? theme.accent : 'transparent'}`,
                  opacity: reveal,
                  transform: `translateX(${(1 - reveal) * 10}px)`,
                }}
              >
                {p.showLineNumbers ? (
                  <span style={{width: 54, flex: '0 0 54px', textAlign: 'right', paddingRight: 16, fontSize: fontSize * 0.72, lineHeight: 1.45, color: isHighlighted ? theme.accent : PAPER.inkSoft, userSelect: 'none'}}>
                    {i + 1}
                  </span>
                ) : null}
                <pre style={{margin: 0, padding: 0, fontSize, lineHeight: 1.45, color: theme.text, whiteSpace: 'pre', overflow: 'hidden'}}>
                  {highlight(line, theme)}
                </pre>
              </div>
            );
          })}
        </div>
      </div>
    </StudyFrame>
  );
};
