import {Fragment} from 'react';

type Piece = {text: string; start?: number; kind?: 'key' | 'string' | 'literal'};
type JsonExample = {header?: string; headerStart: number; pieces: Piece[]; lines: string[]};

const payload = /^(?:((?:(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) +\S[^\r\n]*|(?:HTTP(?:\/\d(?:\.\d)?)?[ \t]+)?[1-5]\d{2}(?:[ \t]+[^\r\n]+)?)(?:\r?\n[\w!#$%&'*+.^_`|~-]+:[^\r\n]*)*)\r?\n)?\s*([\[{][\s\S]*?)\s*$/;
const exchange = /^((?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) +\S[^\r\n]*(?:\r?\n[\w-]+:[^\r\n]*)*(?:\r?\n)+(?:(?:HTTP(?:\/\d(?:\.\d)?)?[ \t]+)?[1-5]\d{2}(?:[ \t]+[^\r\n]+)?)(?:\r?\n[\w-]+:[^\r\n]*)*)\r?\n\s*([\[{][\s\S]*?)\s*$/;
const inlineStatus = /^((?:HTTP(?:\/\d(?:\.\d)?)?[ \t]+)?[1-5]\d{2}(?:[ \t]+[^\r\n·→]+?)?)\s*[·→]\s*([\[{][\s\S]*?)\s*$/;
const statusAndBody = /^((?:HTTP(?:\/\d(?:\.\d)?)?[ \t]+)?[1-5]\d{2}(?:[ \t]+[^\r\n\[{]+?)?)\s+([\[{][\s\S]*?)\s*$/;
const token = /"(?:[^"\\]|\\.)*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g;

export function httpResponseStatus(header?: string) {
  const match = header?.match(/^(?:HTTP(?:\/\d(?:\.\d)?)?[ \t]+)?([1-5]\d{2})(?:[ \t]+([^\r\n]+))?$/m);
  if (!match) return undefined;
  const [, code, reason] = match;
  return {code, line: match[0], label: `Status ${code}${reason ? ` ${reason.trim()}` : code === '200' ? ' OK' : ''}`};
}

/** Resolve an RFC 6901 pointer to the original key and scalar value, or the key of a container. */
export function jsonFieldRange(example: JsonExample, pointer: string): {start: number; length: number} | undefined {
  if (!pointer.startsWith('/') || /~(?![01])/.test(pointer)) return;
  const parts = pointer.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  const tokens = example.pieces.filter(piece => piece.start !== undefined);
  let index = 0;
  let range: {start: number; length: number} | undefined;
  function read(depth: number, key?: Piece) {
    const value = tokens[index++];
    const object = value.text === '{';
    const array = value.text === '[';
    if (depth === parts.length) {
      const first = key ?? value;
      const last = key && (object || array) ? key : value;
      range = {start: first.start!, length: last.start! + last.text.length - first.start!};
    }
    if (!object && !array) return;
    let item = 0;
    while (tokens[index].text !== (object ? '}' : ']')) {
      const property = object ? tokens[index] : undefined;
      const name = property ? JSON.parse(property.text) : String(item++);
      if (property) index += 2;
      read(depth >= 0 && name === parts[depth] ? depth + 1 : -1, property);
      if (tokens[index].text === ',') index++;
    }
    index++;
    if (depth === parts.length && !key) {
      range = {start: value.start!, length: tokens[index - 1].start! + 1 - value.start!};
    }
  }
  read(0);
  return range;
}

/** Format a JSON payload without changing any literal or the source offsets used by narration cues. */
export function formatJsonExample(source: string, sourceStart = 0): JsonExample | null {
  const labeledResponse = /^(Response[ \t]*[·:][ \t]*[1-5]\d{2}(?:[ \t]+[^\r\n]+)?)\r?\n\s*([\[{][\s\S]*?)\s*$/i;
  const match = inlineStatus.exec(source) ?? payload.exec(source) ?? exchange.exec(source)
    ?? statusAndBody.exec(source) ?? labeledResponse.exec(source);
  if (!match) return null;
  const [, header, body] = match;
  try {
    JSON.parse(body);
  } catch {
    return null;
  }

  const offset = sourceStart + source.indexOf(body, header?.length ?? 0);
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
  return {header, headerStart: sourceStart, pieces, lines: pieces.map(({text}) => text).join('').split('\n')};
}

/** Format separate HTTP bodies while preserving offsets in the complete source. */
export function formatJsonExamples(source: string): JsonExample[] {
  const single = formatJsonExample(source);
  if (single) return [single];
  const header = /^(?=(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) +\S|(?:(?:HTTP(?:\/\d(?:\.\d)?)?|Response[ \t]*[·:])[ \t]*)?[1-5]\d{2}(?=[ \t\r\n·→]|$))/gim;
  let start = 0;
  const examples: JsonExample[] = [];
  for (const next of source.matchAll(header)) {
    if (next.index === start) continue;
    const example = formatJsonExample(source.slice(start, next.index), start);
    // A request line and its status can share a single body.
    if (!example) continue;
    examples.push(example);
    start = next.index;
  }
  const last = start > 0 ? formatJsonExample(source.slice(start), start) : null;
  return last ? [...examples, last] : [];
}

/** Wrap the display at fixed columns so frame timing can place a source range on screen. */
export function wrapJsonExample(example: JsonExample, columns: number) {
  const rows: Piece[][] = [[]];
  let column = 0;
  function nextRow() {
    rows.push([]);
    column = 0;
  }
  for (const piece of example.pieces) {
    const newline = piece.text.startsWith('\n');
    if (newline) nextRow();
    const content = newline ? piece.text.slice(1) : piece.text;
    for (let offset = 0; offset < content.length;) {
      if (column === columns) nextRow();
      const text = content.slice(offset, offset + columns - column);
      const start = piece.start === undefined ? undefined : piece.start + offset;
      rows[rows.length - 1].push({...piece, text, start});
      column += text.length;
      offset += text.length;
    }
  }
  const pieces = rows.flatMap((row, index) => index ? [{text: '\n'}, ...row] : row);
  return {...example, pieces, rows};
}

/** Keep the opening, closing, and current annotation visible without altering the source JSON. */
export function previewJsonExample(example: JsonExample, focusStart: number, focusLength: number, maxColumns: number, maxLines = 10) {
  if (example.lines.length <= maxLines && example.lines.every(line => line.length <= maxColumns)) {
    return {...example, abbreviated: false};
  }

  const rows: Piece[][] = [[]];
  for (const piece of example.pieces) {
    if (piece.text.startsWith('\n')) rows.push([{text: piece.text.slice(1)}]);
    else rows[rows.length - 1].push(piece);
  }
  const intersectsFocus = (piece: Piece) => piece.start !== undefined &&
    piece.start < focusStart + focusLength && piece.start + piece.text.length > focusStart;
  const focusRow = focusStart < 0 ? -1 : rows.findIndex(row => row.some(intersectsFocus));
  const last = rows.length - 1;
  const windowSize = Math.max(1, maxLines - 6);
  const windowStart = Math.max(2, Math.min(last - windowSize, focusRow - Math.floor(windowSize / 3)));
  const visible = rows.length <= maxLines ? rows.map((_, i) => i) :
    [...new Set([0, 1, ...Array.from({length: windowSize}, (_, i) => windowStart + i), last - 1, last])].sort((a, b) => a - b);
  const pieces: Piece[] = [];
  let previous = -1;
  for (const row of visible) {
    if (row > previous + 1) {
      const indent = example.lines[previous + 1].match(/^\s*/)?.[0] ?? '';
      pieces.push({text: `\n${indent}…`});
    }
    if (previous >= 0) pieces.push({text: '\n'});
    const line = rows[row];
    if (example.lines[row].length <= maxColumns) {
      pieces.push(...line);
    } else {
      const available = maxColumns - 2;
      let focusColumn = 0;
      for (const piece of line) {
        if (piece.start !== undefined && intersectsFocus(piece)) {
          focusColumn += Math.max(0, focusStart - piece.start);
          break;
        }
        focusColumn += piece.text.length;
      }
      const left = focusColumn >= example.lines[row].length || focusColumn < available / 2 ? 0 :
        Math.min(example.lines[row].length - available, focusColumn - Math.floor(available / 4));
      const right = left + available;
      if (left > 0) pieces.push({text: '…'});
      let column = 0;
      for (const piece of line) {
        const from = Math.max(0, left - column);
        const to = Math.min(piece.text.length, right - column);
        if (to > from) pieces.push({...piece, text: piece.text.slice(from, to),
          start: piece.start === undefined ? undefined : piece.start + from});
        column += piece.text.length;
      }
      if (right < example.lines[row].length) pieces.push({text: '…'});
    }
    previous = row;
  }
  return {...example, pieces, lines: pieces.map(piece => piece.text).join('').split('\n'), abbreviated: true};
}

const colors = {
  dark: {key: '#a9c7f4', string: '#b8e4be', literal: '#f6cc8e'},
  light: {key: '#284d76', string: '#275d49', literal: '#794414'},
};

export function JsonExampleCode({example, focusStart = -1, focusLength = 0, dark = false, fixedLines = false}: {
  example: Pick<JsonExample, 'pieces'>;
  focusStart?: number;
  focusLength?: number;
  dark?: boolean;
  fixedLines?: boolean;
}) {
  const palette = dark ? colors.dark : colors.light;
  return <code dir="ltr" style={{font: 'inherit', whiteSpace: fixedLines ? 'pre' : 'pre-wrap',
    overflowWrap: fixedLines ? undefined : 'anywhere'}}>
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
