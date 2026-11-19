import {Fragment} from 'react';

type Piece = {text: string; start?: number; kind?: 'key' | 'string' | 'literal'};
type JsonExample = {header?: string; pieces: Piece[]; lines: string[]};

const payload = /^(?:((?:(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) +\S[^\r\n]*|(?:HTTP\/\d(?:\.\d)? +)?[1-5]\d{2} +[^\r\n]+)(?:\r?\n[\w!#$%&'*+.^_`|~-]+:[^\r\n]*)*)\r?\n)?\s*([\[{][\s\S]*?)\s*$/;
const token = /"(?:[^"\\]|\\.)*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g;

/** Format a JSON payload without changing any literal or the source offsets used by narration cues. */
export function formatJsonExample(source: string): JsonExample | null {
  const match = payload.exec(source);
  if (!match) return null;
  const [, header, body] = match;
  try {
    JSON.parse(body);
  } catch {
    return null;
  }

  const offset = source.indexOf(body, header?.length ?? 0);
  const tokens = [...body.matchAll(token)];
  const pieces: Piece[] = [];
  let depth = 0;
  const newline = () => pieces.push({text: '\n' + '  '.repeat(depth)});
  tokens.forEach(([text], i) => {
    const previous = tokens[i - 1]?.[0];
    const next = tokens[i + 1]?.[0];
    const opens = text === '{' || text === '[';
    const closes = text === '}' || text === ']';
    if (closes) {
      depth--;
      if (previous !== '{' && previous !== '[') newline();
    }
    const kind = text.startsWith('"') ? next === ':' ? 'key' : 'string' :
      /^(?:-?\d|true|false|null)/.test(text) ? 'literal' : undefined;
    pieces.push({text, start: offset + tokens[i].index, kind});
    if (opens) {
      depth++;
      if (next !== '}' && next !== ']') newline();
    }
    if (text === ',') newline();
    if (text === ':') pieces.push({text: ' '});
  });
  return {header, pieces, lines: pieces.map(({text}) => text).join('').split('\n')};
}

const colors = {
  dark: {key: '#a9c7f4', string: '#b8e4be', literal: '#f6cc8e'},
  light: {key: '#284d76', string: '#275d49', literal: '#794414'},
};

export function JsonExampleCode({example, focusStart = -1, focusLength = 0, dark = false}: {
  example: JsonExample;
  focusStart?: number;
  focusLength?: number;
  dark?: boolean;
}) {
  const palette = dark ? colors.dark : colors.light;
  return <code dir="ltr" style={{font: 'inherit', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>
    {example.pieces.map(({text, start, kind}, i) => {
      if (start === undefined) return <Fragment key={i}>{text}</Fragment>;
      const from = Math.max(0, focusStart - start);
      const to = Math.min(text.length, focusStart + focusLength - start);
      return <span key={i} style={{color: kind ? palette[kind] : undefined}}>
        {focusStart >= 0 && to > from ? <>
          {text.slice(0, from)}
          <mark style={{background: '#fed28f', color: '#281d13', borderRadius: '0.09em'}}>
            {text.slice(from, to)}
          </mark>
          {text.slice(to)}
        </> : text}
      </span>;
    })}
  </code>;
}
