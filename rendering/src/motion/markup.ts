/**
 * Tiny markup for on-screen text written in JSON:
 *   **word**    -> emphasis (accent colour, bold)
 *   ==word==    -> highlighter marker sweeps behind it
 *   __word__    -> hand-drawn underline draws under it
 *   ((word))    -> hand-drawn circle draws around it
 * Everything else is plain text. Marks can wrap several words: "==one building==".
 */
export type Mark = 'none' | 'bold' | 'highlight' | 'underline' | 'circle';
export type Segment = {text: string; mark: Mark};

const PATTERN = /(\*\*[^*]+\*\*|==[^=]+==|__[^_]+__|\(\([^()]+\)\))/g;

export const parseMarkup = (text: string): Segment[] => {
  const out: Segment[] = [];
  for (const part of text.split(PATTERN)) {
    if (!part) continue;
    if (part.startsWith('**')) out.push({text: part.slice(2, -2), mark: 'bold'});
    else if (part.startsWith('==')) out.push({text: part.slice(2, -2), mark: 'highlight'});
    else if (part.startsWith('__')) out.push({text: part.slice(2, -2), mark: 'underline'});
    else if (part.startsWith('((')) out.push({text: part.slice(2, -2), mark: 'circle'});
    else out.push({text: part, mark: 'none'});
  }
  return out;
};

/** Plain text without markup symbols (e.g. for measuring length). */
export const stripMarkup = (text: string) => parseMarkup(text).map((s) => s.text).join('');
