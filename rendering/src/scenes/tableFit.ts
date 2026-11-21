/**
 * Forgiving table input for scenes. Planners often write a cell too many or too few, one column more
 * than fits, extra rows or a long cell. These fit the table instead of failing validation: the scene
 * shows slightly less rather than sending the whole plan back to the LLM for a repair.
 */
const isArr = Array.isArray;

/** Shorten a string longer than max to max characters, ending in "…". Other values are unchanged. */
export const clip = (v: unknown, max?: number): unknown =>
  typeof v === 'string' && max && v.length > max ? `${v.slice(0, max - 1).trimEnd()}…` : v;

/** Keep the first max columns, each header clipped to maxChars. */
export const fitColumns = (columns: unknown, max: number, maxChars?: number): unknown =>
  isArr(columns) ? columns.slice(0, max).map((c) => clip(c, maxChars)) : columns;

/** Keep the first max rows; pad short rows with blank and drop extra cells so each has width cells
 *  (when width is known); clip string cells to maxChars. */
export const fitRows = (rows: unknown, o: {width?: number; max: number; maxChars?: number; blank?: unknown}): unknown =>
  !isArr(rows) ? rows : rows.slice(0, o.max).map((row) => {
    if (!isArr(row)) return row;
    const w = o.width ?? row.length;
    const cells = row.length >= w ? row.slice(0, w) : [...row, ...Array(w - row.length).fill(o.blank ?? '')];
    return cells.map((c) => clip(c, o.maxChars));
  });
