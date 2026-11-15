"""Convert the SOI Outline_of_India.zip polygon shapefile to WGS84 GeoJSON.
Usage: python3 scripts/convert-india-outline.py /tmp/india-outline.zip
Uses the archive's documented LCC WGS84 projection; simplifies to 750 m.
"""
import json
import math
import struct
import sys
import zipfile
from pathlib import Path

archive = zipfile.ZipFile(sys.argv[1])
prj = archive.read('Outline_of_India.prj').decode()
assert all(s in prj for s in ['12.472944', '35.172806', '4000000', '80.0', '24.0']), 'Unexpected CRS'
b = archive.read('Outline_of_India.shp')
assert struct.unpack_from('<i', b, 108)[0] == 5, 'Expected polygon'
parts, count = struct.unpack_from('<2i', b, 144)
starts = list(struct.unpack_from(f'<{parts}i', b, 152)) + [count]
coords = list(struct.iter_unpack('<2d', b[152 + 4 * parts:]))
assert len(coords) == count

def simplify(points, tolerance=750):
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        ax, ay = points[first]; bx, by = points[last]
        dx, dy = bx - ax, by - ay
        length = dx * dx + dy * dy
        best, index = 0, first
        for i in range(first + 1, last):
            x, y = points[i]
            t = max(0, min(1, ((x-ax)*dx + (y-ay)*dy) / length)) if length else 0
            distance = (x-ax-t*dx)**2 + (y-ay-t*dy)**2
            if distance > best:
                best, index = distance, i
        if best > tolerance * tolerance:
            keep.add(index); stack.extend([(first, index), (index, last)])
    result = [points[i] for i in sorted(keep)]
    return result if len(result) >= 4 else points

e = math.sqrt(2 / 298.257223563 - (1 / 298.257223563)**2)
def t(phi):
    return math.tan(math.pi/4 - phi/2) / ((1-e*math.sin(phi))/(1+e*math.sin(phi)))**(e/2)
def m(phi):
    return math.cos(phi)/math.sqrt(1-e*e*math.sin(phi)**2)
p1, p2, p0 = map(math.radians, [12.472944,35.172806,24])
n = math.log(m(p1)/m(p2)) / math.log(t(p1)/t(p2))
f = m(p1)/(n*t(p1)**n)
rho0 = 6378137*f*t(p0)**n

def inverse(point):
    x, y = point[0]-4000000, rho0-(point[1]-4000000)
    rho = math.hypot(x,y)
    tt = (rho/(6378137*f))**(1/n)
    phi = math.pi/2 - 2*math.atan(tt)
    for _ in range(12):
        phi = math.pi/2 - 2*math.atan(tt*((1-e*math.sin(phi))/(1+e*math.sin(phi)))**(e/2))
    return [round(80+math.degrees(math.atan2(x,y)/n),5), round(math.degrees(phi),5)]

polygons = []
for i in range(parts):
    ring = coords[starts[i]:starts[i+1]]
    area = sum(a[0]*c[1]-c[0]*a[1] for a,c in zip(ring,ring[1:]))
    simplified = simplify(ring)
    simple_area = sum(a[0]*c[1]-c[0]*a[1] for a,c in zip(simplified,simplified[1:]))
    if simple_area * area <= 0: simplified = ring
    points = [inverse(p) for p in simplified]
    if points[0] != points[-1]: points.append(points[0])
    # Shapefile and D3 both use clockwise exterior rings.
    if area < 0: polygons.append([points])
    else:
        assert polygons, 'Hole precedes outer ring'
        polygons[-1].append(points)
result = {'type':'Feature','properties':{'name':'India','source':'Survey of India, Outline_of_India.zip (2026)','boundaryConvention':'Official Indian depiction'},'geometry':{'type':'MultiPolygon','coordinates':polygons}}
out = Path(__file__).resolve().parents[1] / 'src/data/india-soi.json'
out.write_text(json.dumps(result,separators=(',',':'))+'\n')
flat = [p for poly in polygons for ring in poly for p in ring]
print(len(polygons), 'polygons;',len(flat),'points; bounds:',[min(p[j] for p in flat) for j in [0,1]],[max(p[j] for p in flat) for j in [0,1]])
