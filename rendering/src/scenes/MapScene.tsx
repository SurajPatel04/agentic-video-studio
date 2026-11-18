import {PAPER} from '../iso/iso';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {z} from 'zod';
import {geoArea, geoCentroid, geoGraticule10, geoNaturalEarth1, geoPath} from 'd3-geo';
import type {Feature, MultiPolygon, Polygon} from 'geojson';
import {feature, mesh} from 'topojson-client';
import type {GeometryCollection, Topology} from 'topojson-specification';
import countriesTopo from 'world-atlas/countries-50m.json';
import {StudyFrame} from '../components/StudyFrame';
import {useTheme} from '../theme';

const nonnegative = z.number().int().nonnegative();
const positive = z.number().int().positive();

const citySchema = z.object({
  name: z.string(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const mapSceneSchema = z.object({
  title: z.string().default('A networked world'),
  eyebrow: z.string().default('MAP / GLOBAL VIEW'),
  highlightCountries: z.array(z.string()).max(12).default(['India', 'Singapore', 'United Kingdom', 'United States of America']),
  cities: z.array(citySchema).max(10).default([
    {name: 'New Delhi', lat: 28.6139, lon: 77.209},
    {name: 'Singapore', lat: 1.3521, lon: 103.8198},
    {name: 'London', lat: 51.5074, lon: -0.1278},
    {name: 'New York', lat: 40.7128, lon: -74.006},
    {name: 'Tokyo', lat: 35.6762, lon: 139.6503},
    {name: 'Sydney', lat: -33.8688, lon: 151.2093},
    {name: 'Dubai', lat: 25.2048, lon: 55.2708},
    {name: 'São Paulo', lat: -23.5505, lon: -46.6333},
  ]),
  routes: z.array(z.object({from: z.string(), to: z.string()})).max(8).default([
    {from: 'New Delhi', to: 'Singapore'},
    {from: 'Singapore', to: 'London'},
    {from: 'London', to: 'New York'},
  ]),
  showLabels: z.boolean().default(true),
  showGraticule: z.boolean().default(true),
  startAt: nonnegative.default(10),
  stagger: nonnegative.default(14),
  drawFrames: positive.default(38),
  oceanColor: z.string().default('#e6eff2'),
  landColor: z.string().default('#b8d6c0'),
  highlightColor: z.string().optional(),
  borderColor: z.string().default('#7b9786'),
  routeColor: z.string().optional(),
  footer: z.string().default('Country outlines are from Natural Earth; this is a visualization, not a survey map.'),
});

export const description = 'A flat world map with highlighted countries, city markers, and animated route arcs.';
export const tags = ['map', 'geography', 'world', 'countries', 'cities', 'routes', 'global'];

type CountryFeature = Feature<Polygon | MultiPolygon, {name: string}>;
type LatLon = {lat: number; lon: number};

const topo = countriesTopo as unknown as Topology<{countries: GeometryCollection<{name: string}>}>;
const COUNTRIES = (feature(topo, topo.objects.countries) as unknown as {features: CountryFeature[]}).features;
const LAND = COUNTRIES.filter((country) => country.properties.name !== 'Antarctica');
const BORDERS = mesh(topo, topo.objects.countries, (a, b) => a !== b);

const ALIASES: Record<string, string> = {
  usa: 'united states of america',
  us: 'united states of america',
  america: 'united states of america',
  'united states': 'united states of america',
  uk: 'united kingdom',
  britain: 'united kingdom',
  england: 'united kingdom',
  uae: 'united arab emirates',
  korea: 'south korea',
};
const normalize = (name: string) => ALIASES[name.trim().toLowerCase()] ?? name.trim().toLowerCase();
const findCountry = (name: string) => COUNTRIES.find((country) => normalize(country.properties.name) === normalize(name));

const countryCenter = (country: CountryFeature): LatLon => {
  let target: Feature<Polygon> | CountryFeature = country;
  if (country.geometry.type === 'MultiPolygon') {
    const parts = country.geometry.coordinates.map((coords): Feature<Polygon> => ({
      type: 'Feature',
      properties: {},
      geometry: {type: 'Polygon', coordinates: coords},
    }));
    target = parts.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
  }
  const [lon, lat] = geoCentroid(target);
  return {lat, lon};
};

const resolvePoint = (name: string, cities: z.infer<typeof citySchema>[]): (LatLon & {label: string}) | null => {
  const city = cities.find((item) => item.name.toLowerCase() === name.trim().toLowerCase());
  if (city) return {lat: city.lat, lon: city.lon, label: city.name};
  const country = findCountry(name);
  if (!country) return null;
  return {...countryCenter(country), label: country.properties.name};
};

const projection = geoNaturalEarth1().fitExtent([[18, 18], [1422, 557]], {
  type: 'FeatureCollection',
  features: LAND,
});
const path = geoPath(projection);

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export const MapScene: React.FC<z.input<typeof mapSceneSchema>> = (input) => {
  const p = mapSceneSchema.parse(input);
  const frame = useCurrentFrame();
  const theme = useTheme();
  const highlight = p.highlightColor ?? theme.accent;
  const routeColor = p.routeColor ?? theme.accent;
  const highlighted = new Set(p.highlightCountries.map(normalize));
  const mapReveal = clamp((frame - 2) / 18);

  const routes = p.routes.map((route) => {
    const from = resolvePoint(route.from, p.cities);
    const to = resolvePoint(route.to, p.cities);
    if (!from || !to) return null;
    const d = path({
      type: 'LineString',
      coordinates: [[from.lon, from.lat], [to.lon, to.lat]],
    });
    return {from, to, d};
  }).filter((route): route is {from: LatLon & {label: string}; to: LatLon & {label: string}; d: string | null} => route !== null);

  const projectedCities = p.cities.map((city) => {
    const point = projection([city.lon, city.lat]);
    return point ? {name: city.name, x: point[0], y: point[1]} : null;
  }).filter((city): city is {name: string; x: number; y: number} => city !== null);

  return (
    <StudyFrame title={p.title} eyebrow={p.eyebrow} footer={p.footer || undefined}>
      <svg viewBox="0 0 1440 575" width="100%" height="100%" role="img" aria-label={p.title} style={{opacity: mapReveal}}>
        <defs>
          <radialGradient id="map-ocean-glow" cx="50%" cy="45%" r="72%">
            <stop offset="0%" stopColor={p.oceanColor} stopOpacity={0.55} />
            <stop offset="100%" stopColor={p.oceanColor} stopOpacity={0} />
          </radialGradient>
          <filter id="map-route-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x={0} y={0} width={1440} height={575} rx={18} fill={p.oceanColor} />
        <rect x={0} y={0} width={1440} height={575} rx={18} fill="url(#map-ocean-glow)" />
        {p.showGraticule ? <path d={path(geoGraticule10()) ?? ''} fill="none" stroke="#7fb4cf" strokeOpacity={0.28} strokeWidth={1} /> : null}

        {LAND.map((country, i) => {
          const active = highlighted.has(normalize(country.properties.name));
          return <path key={`${country.properties.name}-${i}`} d={path(country) ?? ''} fill={active ? highlight : p.landColor} fillOpacity={active ? 0.82 : 1} stroke={p.borderColor} strokeWidth={0.7} />;
        })}
        <path d={path(BORDERS) ?? ''} fill="none" stroke={p.borderColor} strokeWidth={0.7} strokeOpacity={0.85} />

        {routes.map((route, i) => {
          const progress = interpolate(frame, [p.startAt + i * p.stagger, p.startAt + i * p.stagger + p.drawFrames], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.inOut(Easing.cubic),
          });
          return route.d ? (
            <g key={`${route.from.label}-${route.to.label}-${i}`}>
              <path
                d={route.d}
                fill="none"
                stroke={routeColor}
                strokeWidth={3.4}
                strokeLinecap="round"
                strokeOpacity={0.95}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - progress}
                filter="url(#map-route-glow)"
              />
            </g>
          ) : null;
        })}

        {projectedCities.map((city, i) => {
          const reveal = clamp((frame - p.startAt - i * 3) / 12);
          return (
            <g key={city.name} opacity={reveal}>
              <circle cx={city.x} cy={city.y} r={13} fill={routeColor} fillOpacity={0.16} />
              <circle cx={city.x} cy={city.y} r={5.5} fill={routeColor} stroke={PAPER.card} strokeWidth={2} />
              {p.showLabels ? (
                <text
                  x={city.x + 13}
                  y={city.y - 11}
                  fill={theme.text}
                  fontSize={18}
                  fontWeight={600}
                  style={{paintOrder: 'stroke', stroke: PAPER.card, strokeWidth: 7, strokeLinejoin: 'round'}}
                >
                  {city.name}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </StudyFrame>
  );
};
