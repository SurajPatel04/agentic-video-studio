import {stripMarkup} from './motion';

/**
 * Font scale for a text card, from 1 (roomy) down to ``min``: the more points and visible text a card
 * holds, the smaller its title, body and points, so a busy card still fits without scrolling.
 * ``roomyItems`` / ``roomyChars`` are what fits at full size; past them the scale falls as 1/sqrt(load).
 */
export const densityScale = (items: number, texts: (string | undefined)[],
  {roomyItems = 3, roomyChars = 240, min = 0.6}: {roomyItems?: number; roomyChars?: number; min?: number} = {}) => {
  const chars = texts.reduce((n, t) => n + (t ? stripMarkup(t).length : 0), 0);
  const load = Math.max(items / roomyItems, chars / roomyChars);
  return load <= 1 ? 1 : Math.max(min, 1 / Math.sqrt(load));
};

/** Extra shrink for a long title on its own (it wraps onto 3+ lines at full size). */
export const titleScale = (title: string | undefined, roomyChars = 55, min = 0.7) => {
  const n = title ? stripMarkup(title).length : 0;
  return n <= roomyChars ? 1 : Math.max(min, Math.sqrt(roomyChars / n));
};
