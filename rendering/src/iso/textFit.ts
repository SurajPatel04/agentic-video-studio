import {PAPER} from './iso';

let measureContext: CanvasRenderingContext2D | null = null;

export function paperTextEmWidth(value: string, weight: number) {
  if (typeof document !== 'undefined') {
    measureContext ??= document.createElement('canvas').getContext('2d');
  }
  if (measureContext) measureContext.font = `${weight} 100px ${PAPER.sans}`;
  return measureContext ? measureContext.measureText(value).width / 100 : Array.from(value).length;
}

export function fittedPaperText(value: string, width: number, fontSize: number, weight: number) {
  return Math.max(0, Math.min(fontSize, (width - 2) / Math.max(0.01, paperTextEmWidth(value, weight))));
}
