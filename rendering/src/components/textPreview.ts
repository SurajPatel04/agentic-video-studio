  type Line = {start: number; text: string};

/** Soft-wrap while retaining source offsets for annotations. */
export function wrapPreviewLines(source: string, columns: number): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (const line of source.split('\n')) {
    let offset = 0;
    while (line.length - offset > columns) {
      const end = offset + columns;
      const space = line.slice(offset, end + 1).lastIndexOf(' ');
      const cut = space > 0 ? offset + space : end;
      lines.push({start: start + offset, text: line.slice(offset, cut)});
      offset = line[cut] === ' ' ? cut + 1 : cut;
    }
    lines.push({start: start + offset, text: line.slice(offset).replace(/\r$/, '')});
    start += line.length + 1;
  }
  return lines;
}

/** Show a window around the highlighted text when the full example cannot fit. */
export function previewLineWindow(lines: Line[], maxRows: number, focusStart = -1, focusLength = 0) {
  if (lines.length <= maxRows) return {lines, leading: false, trailing: false};
  const focusLine = focusStart < 0 ? -1 : lines.findIndex(line =>
    line.start < focusStart + focusLength && line.start + line.text.length > focusStart);
  const count = maxRows - 2;
  const first = Math.min(lines.length - count, Math.max(0, focusLine - Math.floor(count / 2)));
  return {lines: lines.slice(first, first + count), leading: first > 0, trailing: first + count < lines.length};
}
