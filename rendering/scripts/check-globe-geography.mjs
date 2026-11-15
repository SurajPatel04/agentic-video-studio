import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {geoArea, geoContains} from 'd3-geo';

const india = JSON.parse(readFileSync(new URL('../src/data/india-soi.json', import.meta.url), 'utf8'));
// Detect reversed polygon winding, which would fill the rest of the Earth.
assert(geoArea(india) > 0.075 && geoArea(india) < 0.09, 'Unexpected India surface area or winding');
for (const [name, point, expected] of [
  ['Delhi', [77.2, 28.6], true],
  ['Mumbai', [72.88, 19.08], true],
  ['Leh', [77.58, 34.15], true],
  ['Itanagar', [93.62, 27.08], true],
  ['Port Blair', [92.73, 11.67], true],
  ['Colombo', [79.86, 6.93], false],
  ['Kathmandu', [85.32, 27.72], false],
]) assert.equal(geoContains(india, point), expected, name);
for (const coordinates of india.geometry.coordinates) {
  assert(geoArea({type: 'Polygon', coordinates}) < 0.1, 'Inverted island ring');
}
console.log('India geography checks passed (area, ring winding, mainland, islands, neighboring countries).');
