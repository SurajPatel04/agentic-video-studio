import {staticFile} from 'remotion';

export function resolveImageSource(src: string) {
  const value = src.trim();
  if (!value) return undefined;
  return /^(https?:\/\/|data:)/.test(value) ? value : staticFile(value.replace(/^\/+/, ''));
}
