export type Topology = 'star' | 'bus' | 'ring' | 'mesh';
export type Point3 = [number, number, number];
export type NetworkLayout = {positions: Point3[]; paths: Point3[][]};

/** Pure layout: a star's node 0 is the hub; a bus has a shared backbone plus drops. */
export const networkLayout = (topology: Topology, count: number): NetworkLayout => {
  if (count < 3 || count > 8 || !Number.isInteger(count)) throw new Error('Network needs 3–8 devices');
  if (topology === 'bus') {
    const positions: Point3[] = Array.from({length: count}, (_, i) => [-4.2 + 8.4 * i / (count - 1), 0, i % 2 ? 1.7 : -1.7]);
    return {positions, paths: [[[-4.8, 0, 0], [4.8, 0, 0]], ...positions.map(([x, y, z]): Point3[] => [[x, y, 0], [x, y, z]])]};
  }
  const positions: Point3[] = Array.from({length: count}, (_, i) => {
    if (topology === 'star' && i === 0) return [0, 0, 0];
    const angle = 2 * Math.PI * (topology === 'star' ? i - 1 : i) / (topology === 'star' ? count - 1 : count) - Math.PI / 2;
    return [Math.cos(angle) * 4, 0, Math.sin(angle) * 2.5];
  });
  const pairs: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    if (topology === 'star' && i > 0) pairs.push([0, i]);
    if (topology === 'ring') pairs.push([i, (i + 1) % count]);
    if (topology === 'mesh') for (let j = i + 1; j < count; j++) pairs.push([i, j]);
  }
  return {positions, paths: pairs.map(([a, b]) => [positions[a], positions[b]])};
};
