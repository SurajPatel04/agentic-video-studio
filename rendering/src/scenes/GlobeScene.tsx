import {z} from 'zod';
import {useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import {geoArea, geoCentroid, geoEquirectangular, geoGraticule10, geoPath} from 'd3-geo';
import type {Feature, MultiPolygon, Polygon} from 'geojson';
import type {CSSProperties} from 'react';
import {useEffect, useMemo, useState} from 'react';
import {AbsoluteFill, Easing, cancelRender, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {feature, mesh} from 'topojson-client';
import type {GeometryCollection, Topology} from 'topojson-specification';
import countriesTopo from 'world-atlas/countries-50m.json';
import indiaOutline from '../data/india-soi.json';
import {entrance} from '../animation';
import {useTheme, useUnit} from '../theme';

/* ------------------------------------------------------------------ types */

export type City = {name: string; lat: number; lon: number};
/** `from` / `to` are a city name from `cities` or a country name ("India", "USA", "Japan"). */
export type Route = {from: string; to: string};

export type GlobeSceneProps = {
  surface?: 'satellite' | 'political';
  indiaBoundary?: 'official' | 'natural-earth';
  showAtmosphere?: boolean;
  showStars?: boolean;
  routes?: Route[];
  links?: [string, string][]; // older format, same as routes
  cities?: City[]; // optional exact places; countries work without this
  camera?: 'follow' | 'overview'; // follow = globe turns with each packet
  title?: string;
  caption?: string;
  showLabels?: boolean;
  highlightCountries?: string[]; // extra countries to colour
  highlightRouteCountries?: boolean; // colour every country used in routes (default true)
  // timing (frames)
  startAt?: number; // first route starts
  travelFrames?: number; // follow: packet travel time per route
  holdFrames?: number; // follow: pause on the destination
  returnFrames?: number; // follow: camera swing back to the next origin
  linkStagger?: number; // overview: frames between arcs
  drawFrames?: number; // overview: frames to draw one arc
  packetFrames?: number; // looping traffic on finished routes
  keepTraffic?: boolean; // keep small packets moving on finished routes
  bidirectional?: boolean; // looping traffic goes both ways
  spinSpeed?: number; // overview: radians per second
  cameraDistance?: number; // smaller = bigger globe
  zoomOnTravel?: number; // follow: how much to zoom in mid-flight
  // colours
  oceanColor?: string;
  landColor?: string;
  highlightColor?: string;
  borderColor?: string;
  arcColor?: string;
  packetColor?: string;
  titleStyle?: CSSProperties;
  captionStyle?: CSSProperties;
  labelStyle?: CSSProperties;
};

/* -------------------------------------------------------------- geography */

const EMPTY_CITIES: City[] = [];
const EMPTY_COUNTRIES: string[] = [];
const R = 2; // globe radius in world units
const DEG = Math.PI / 180;
const FOV = 45;

type CountryFeature = Feature<Polygon | MultiPolygon, {name: string}>;

const topo = countriesTopo as unknown as Topology<{countries: GeometryCollection<{name: string}>}>;
const COUNTRIES = (feature(topo, topo.objects.countries) as unknown as {features: CountryFeature[]}).features;
const INDIA = indiaOutline as unknown as CountryFeature;
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
const normalizeName = (name: string) => {
  const n = name.trim().toLowerCase();
  return ALIASES[n] ?? n;
};
const findCountry = (name: string) =>
  COUNTRIES.find((c) => c.properties.name.toLowerCase() === normalizeName(name));

/** Centre of a country's largest landmass (so the USA is not centred near Alaska). */
const countryCenter = (c: CountryFeature): {lat: number; lon: number} => {
  let target: Feature<Polygon> | CountryFeature = c;
  if (c.geometry.type === 'MultiPolygon') {
    const parts = c.geometry.coordinates.map(
      (coords): Feature<Polygon> => ({type: 'Feature', properties: {}, geometry: {type: 'Polygon', coordinates: coords}}),
    );
    target = parts.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
  }
  const [lon, lat] = geoCentroid(target);
  return {lat, lon};
};

type Place = {name: string; lat: number; lon: number; country?: string};

const resolvePlace = (name: string, cities: City[]): Place | null => {
  const city = cities.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  if (city) return city;
  const country = normalizeName(name) === 'india' ? INDIA : findCountry(name);
  if (!country) return null;
  return {name, ...countryCenter(country), country: country.properties.name};
};

const toVec3 = (lat: number, lon: number, r = R) => {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
};

const toLatLon = (v: THREE.Vector3) => {
  const n = v.clone().normalize();
  return {lat: Math.asin(n.y) / DEG, lon: Math.atan2(-n.z, n.x) / DEG};
};

/** Globe rotation that puts (lat, lon) in the middle of the screen, north up. */
const rotationFacing = (lat: number, lon: number, tilt = 0.85) => ({
  yaw: -Math.PI / 2 - lon * DEG,
  pitch: lat * DEG * tilt,
});

/** Great-circle path between two points on the globe, lifted into an arc. */
class GreatArc extends THREE.Curve<THREE.Vector3> {
  private a: THREE.Vector3;
  private b: THREE.Vector3;
  private angle: number;
  private lift: number;
  constructor(from: THREE.Vector3, to: THREE.Vector3) {
    super();
    this.a = from.clone().normalize();
    this.b = to.clone().normalize();
    this.angle = Math.acos(THREE.MathUtils.clamp(this.a.dot(this.b), -1, 1));
    this.lift = 0.12 + this.angle * 0.2; // longer routes fly higher
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const {a, b, angle} = this;
    if (angle < 1e-6) return target.copy(a).multiplyScalar(R);
    const s = Math.sin(angle);
    const p = a
      .clone()
      .multiplyScalar(Math.sin((1 - t) * angle) / s)
      .add(b.clone().multiplyScalar(Math.sin(t * angle) / s));
    return target.copy(p.normalize().multiplyScalar(R * 1.005 + this.lift * Math.sin(Math.PI * t)));
  }
}

/** Load only the bundled image; block rendering until decoding is complete. */
const useEarthImage = (enabled: boolean) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [handle] = useState(() => delayRender('Loading local NASA Earth imagery'));
  useEffect(() => {
    if (!enabled) { continueRender(handle); return; }
    const img = new Image();
    img.onload = () => { setImage(img); continueRender(handle); };
    img.onerror = () => cancelRender(new Error('Could not load bundled Earth texture'));
    img.src = staticFile('earth/blue-marble.png');
    return () => { img.onload = null; img.onerror = null; };
  }, [enabled, handle]);
  return enabled ? image : null;
};

/** Country overlays are separate so the official India outline can erase conflicting lines. */
const makeEarthTexture = (ocean: string, land: string, highlight: string, border: string, highlighted: Set<string>, satellite: HTMLImageElement | null, officialIndia: boolean) => {
  const w = 4096, h = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const projection = geoEquirectangular().scale(w / (2 * Math.PI)).translate([w / 2, h / 2]);
  const path = geoPath(projection, ctx);
  if (satellite) ctx.drawImage(satellite, 0, 0, w, h);
  else {
    ctx.fillStyle = ocean; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = land;
    for (const c of COUNTRIES) { ctx.beginPath(); path(c); ctx.fill(); }
    ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.stroke();
  }
  const overlay = document.createElement('canvas');
  overlay.width = w; overlay.height = h;
  const ink = overlay.getContext('2d')!;
  const draw = geoPath(projection, ink);
  for (const c of COUNTRIES) {
    if (officialIndia && c.properties.name === 'India') continue;
    if (!highlighted.has(c.properties.name)) continue;
    ink.beginPath(); draw(c); ink.fillStyle = highlight;
    ink.globalAlpha = satellite ? 0.16 : 1; ink.fill();
    ink.globalAlpha = 1; ink.strokeStyle = highlight; ink.lineWidth = 1.6; ink.stroke();
  }
  ink.beginPath(); draw(BORDERS); ink.strokeStyle = border; ink.lineWidth = 0.8; ink.stroke();
  if (officialIndia) {
    ink.globalCompositeOperation = 'destination-out';
    ink.beginPath(); draw(INDIA); ink.fill();
    ink.globalCompositeOperation = 'source-over';
    if (highlighted.has('India')) {
      ink.beginPath(); draw(INDIA); ink.fillStyle = highlight;
      ink.globalAlpha = satellite ? 0.2 : 1; ink.fill(); ink.globalAlpha = 1;
    }
    ink.beginPath(); draw(INDIA);
    ink.strokeStyle = highlighted.has('India') ? highlight : border;
    ink.lineWidth = highlighted.has('India') ? 2.2 : 1; ink.stroke();
  }
  ctx.drawImage(overlay, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};

const Atmosphere: React.FC<{opacity: number; scale: number}> = ({opacity, scale}) => <mesh scale={scale}>
  <sphereGeometry args={[R * 1.018, 96, 96]}/>
  <shaderMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending}
    uniforms={{strength: {value: opacity}}}
    vertexShader={`varying vec3 n; varying vec3 v;
      void main(){ vec4 p=modelViewMatrix*vec4(position,1.0); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p; }`}
    fragmentShader={`varying vec3 n; varying vec3 v; uniform float strength;
      void main(){ float rim=pow(1.0-max(0.0,dot(normalize(n),normalize(v))),3.5); gl_FragColor=vec4(0.18,0.52,1.0,rim*0.65*strength); }`}/>
</mesh>;

/* ------------------------------------------------------------- 3D pieces */

const Arc: React.FC<{curve: GreatArc; progress: number; color: string}> = ({curve, progress, color}) => {
  const geometry = useMemo(() => {
    if (progress <= 0.01) return null;
    const pts = curve.getPoints(100).slice(0, Math.max(2, Math.ceil(100 * progress) + 1));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 100, 0.018, 8, false);
  }, [curve, progress]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color={color} transparent opacity={0.95} />
    </mesh>
  );
};

const Packet: React.FC<{curve: GreatArc; t: number; color: string; size?: number; reverse?: boolean}> = ({
  curve,
  t,
  color,
  size = 1,
  reverse,
}) => (
  <>
    {[0, 1, 2, 3, 4, 5].map((k) => {
      const tk = t - k * 0.022;
      if (tk < 0) return null;
      const p = curve.getPoint(reverse ? 1 - tk : tk);
      return (
        <group key={k} position={p} scale={size}>
          <mesh>
            <sphereGeometry args={[k === 0 ? 0.07 : 0.05 * (1 - k / 7), 16, 16]} />
            <meshBasicMaterial color={color} transparent opacity={k === 0 ? 1 : 0.7 * (1 - k / 6)} />
          </mesh>
          {k === 0 ? (
            <mesh>
              <sphereGeometry args={[0.13, 16, 16]} />
              <meshBasicMaterial color={color} transparent opacity={0.3} blending={THREE.AdditiveBlending} />
            </mesh>
          ) : null}
        </group>
      );
    })}
  </>
);

/* ------------------------------------------------------------------ scene */

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const ease = Easing.inOut(Easing.cubic);

export const GlobeScene: React.FC<GlobeSceneProps> = ({
  surface = 'satellite',
  indiaBoundary = 'official',
  showAtmosphere = true,
  showStars = true,
  routes: routesProp,
  links,
  cities = EMPTY_CITIES,
  camera = 'follow',
  title,
  caption,
  showLabels = true,
  highlightCountries = EMPTY_COUNTRIES,
  highlightRouteCountries = true,
  startAt = 20,
  travelFrames = 70,
  holdFrames = 20,
  returnFrames = 25,
  linkStagger = 12,
  drawFrames = 30,
  packetFrames = 50,
  keepTraffic = true,
  bidirectional = true,
  spinSpeed = 0.04,
  cameraDistance = 5.8,
  zoomOnTravel = 0.5,
  oceanColor = '#0b3b6f',
  landColor = '#2f8f6b',
  highlightColor = '#f4c76b',
  borderColor = 'rgba(192,215,231,0.28)',
  arcColor,
  packetColor = '#fde047',
  titleStyle,
  captionStyle,
  labelStyle,
}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const theme = useTheme();
  const u = useUnit();
  const arcs = arcColor ?? theme.accent;

  // Layout: title band on top, caption band at the bottom, 3D view fills the middle.
  const pad = 50 * u;
  const titleH = title ? 140 * u : 0;
  const captionH = caption ? 110 * u : 0;
  // The 3D canvas covers the whole frame (so high arcs are never clipped), but the globe is
  // centred in the band between title and caption and sized to fit that band.
  const bandTop = pad + titleH;
  const bandH = Math.max(100, height - bandTop - captionH - pad);
  const offsetY = bandTop + bandH / 2 - height / 2;

  // Resolve routes -> places -> curves. Unknown names are skipped.
  const resolved = useMemo(() => {
    const raw: Route[] = routesProp ?? (links ?? []).map(([from, to]) => ({from, to}));
    const out: {from: Place; to: Place; curve: GreatArc}[] = [];
    for (const r of raw) {
      const from = resolvePlace(r.from, cities);
      const to = resolvePlace(r.to, cities);
      if (from && to) out.push({from, to, curve: new GreatArc(toVec3(from.lat, from.lon), toVec3(to.lat, to.lon))});
    }
    return out;
  }, [routesProp, links, cities]);

  const places = useMemo(() => {
    const map = new Map<string, Place>();
    for (const c of cities) map.set(c.name, c);
    for (const r of resolved) {
      map.set(r.from.name, r.from);
      map.set(r.to.name, r.to);
    }
    return [...map.values()];
  }, [cities, resolved]);

  const earthImage = useEarthImage(surface === 'satellite');
  const texture = useMemo(() => {
    const names = new Set<string>();
    for (const n of highlightCountries) {
      const c = findCountry(n);
      if (c) names.add(c.properties.name);
    }
    if (highlightRouteCountries) for (const p of places) if (p.country) names.add(p.country);
    return makeEarthTexture(oceanColor, landColor, highlightColor, borderColor, names, earthImage, indiaBoundary === 'official');
  }, [oceanColor, landColor, highlightColor, borderColor, highlightCountries, highlightRouteCountries, places, earthImage, indiaBoundary]);
  useEffect(() => () => texture.dispose(), [texture]);

  /* ---------- timeline: where the camera looks and how far each route has got */
  const segment = travelFrames + holdFrames + returnFrames;
  const routeStart = (i: number) => (camera === 'follow' ? startAt + i * segment : startAt + i * linkStagger);
  const routeLength = camera === 'follow' ? travelFrames : drawFrames;
  const progressOf = (i: number) => ease(interpolate(frame, [routeStart(i), routeStart(i) + routeLength], [0, 1], clamp));

  let focus: THREE.Vector3;
  let zoom = 0;
  if (camera === 'follow' && resolved.length > 0) {
    const first = resolved[0];
    focus = toVec3(first.from.lat, first.from.lon);
    for (let i = 0; i < resolved.length; i++) {
      const s = routeStart(i);
      if (frame < s) break;
      const r = resolved[i];
      const local = frame - s;
      if (local <= travelFrames) {
        const t = progressOf(i);
        focus = r.curve.getPoint(t);
        zoom = Math.sin(Math.PI * t) * zoomOnTravel;
      } else if (local <= travelFrames + holdFrames) {
        focus = toVec3(r.to.lat, r.to.lon);
      } else {
        const next = resolved[i + 1];
        const target = next ? toVec3(next.from.lat, next.from.lon) : toVec3(r.to.lat, r.to.lon);
        const k = ease(interpolate(local - travelFrames - holdFrames, [0, returnFrames], [0, 1], clamp));
        focus = toVec3(r.to.lat, r.to.lon).lerp(target, k);
      }
    }
  } else {
    // Overview: face the average of all places and spin slowly.
    const avg = places.reduce((v, p) => v.add(toVec3(p.lat, p.lon)), new THREE.Vector3());
    focus = avg.lengthSq() > 0 ? avg : toVec3(22, 79);
  }
  const {lat: focusLat, lon: focusLon} = toLatLon(focus);
  const {yaw, pitch} = rotationFacing(focusLat, focusLon);
  const spin = camera === 'overview' ? (frame / fps) * spinSpeed : 0;
  const spinY = yaw + spin;
  // In follow mode zoom in a little mid-flight (closer camera = larger globe).
  // Scaled so the globe fits the band rather than the full frame height.
  const camZ = (cameraDistance - zoom) * (height / bandH);

  const globeIn = spring({frame, fps, config: {damping: 200}});
  const scale = interpolate(globeIn, [0, 1], [0.85, 1]);

  // Project places to screen space for the HTML labels.
  const labels = useMemo(() => {
    if (!showLabels) return [];
    const cam = new THREE.PerspectiveCamera(FOV, width / height, 0.1, 100);
    aimCamera(cam, camZ, width, height, offsetY);
    const eSpin = new THREE.Euler(0, spinY, 0);
    const eTilt = new THREE.Euler(pitch, 0, 0);
    return places.map((p) => {
      const world = toVec3(p.lat, p.lon).applyEuler(eSpin).applyEuler(eTilt).multiplyScalar(scale);
      const facing = world.clone().normalize().dot(cam.position.clone().sub(world).normalize());
      const ndc = world.clone().project(cam);
      return {
        name: p.name,
        x: ((ndc.x + 1) / 2) * width,
        y: ((1 - ndc.y) / 2) * height,
        opacity: interpolate(facing, [0.04, 0.2], [0, 1], clamp),
      };
    });
  }, [showLabels, places, spinY, pitch, scale, camZ, width, height, offsetY]);

  return (
    <AbsoluteFill>
      {showStars && <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, #0d2035 0%, #020611 72%)'}}>
        {Array.from({length: 130}, (_, i) => <div key={i} style={{position: 'absolute', left: `${((i * 73.137) % 100)}%`, top: `${((i * 37.719) % 100)}%`, width: (i % 4 === 0 ? 2 : 1) * u, height: (i % 4 === 0 ? 2 : 1) * u, borderRadius: '50%', background: '#c9def7', opacity: 0.15 + (i % 5) * 0.1}}/>)}
      </AbsoluteFill>}
      <AbsoluteFill>
        <ThreeCanvas width={width} height={height} camera={{position: [0, 0, camZ], fov: FOV}}>
          <CameraRig z={camZ} width={width} height={height} offsetY={offsetY} />
          <ambientLight intensity={0.42} />
          <directionalLight position={[-3, 4, 6]} intensity={2.1} color="#fff4de" />
          <directionalLight position={[4, -1, -3]} intensity={0.35} color="#548cff" />
          {showAtmosphere && <Atmosphere opacity={globeIn} scale={scale}/>}
          <group scale={scale} rotation={[pitch, 0, 0]}>
            <group rotation={[0, spinY, 0]}>
              <mesh>
                <sphereGeometry args={[R, 128, 128]} />
                <meshPhongMaterial map={texture} shininess={18} specular="#233f55" transparent opacity={globeIn} />
              </mesh>

              {places.map((p, i) => {
                const pop = spring({frame: frame - 10 - i * 4, fps, config: {damping: 12}});
                const pulse = 1 + 0.3 * Math.sin((frame / fps) * 4 + i);
                return (
                  <group key={p.name} position={toVec3(p.lat, p.lon, R * 1.005)} scale={pop}>
                    <mesh>
                      <sphereGeometry args={[0.05, 16, 16]} />
                      <meshBasicMaterial color="#ffffff" />
                    </mesh>
                    <mesh scale={pulse}>
                      <sphereGeometry args={[0.1, 16, 16]} />
                      <meshBasicMaterial color={arcs} transparent opacity={0.35} blending={THREE.AdditiveBlending} />
                    </mesh>
                  </group>
                );
              })}

              {resolved.map((r, i) => {
                const progress = progressOf(i);
                const done = frame >= routeStart(i) + routeLength;
                const after = frame - (routeStart(i) + routeLength);
                const loopT = (after % packetFrames) / packetFrames;
                const loopBack = ((after + packetFrames / 2) % packetFrames) / packetFrames;
                return (
                  <group key={i}>
                    <Arc curve={r.curve} progress={progress} color={arcs} />
                    {/* the main packet flies while the arc is drawn */}
                    {progress > 0 && !done ? <Packet curve={r.curve} t={progress} color={packetColor} size={1.3} /> : null}
                    {done && keepTraffic ? <Packet curve={r.curve} t={loopT} color={packetColor} size={0.8} /> : null}
                    {done && keepTraffic && bidirectional ? (
                      <Packet curve={r.curve} t={loopBack} color={packetColor} size={0.8} reverse />
                    ) : null}
                  </group>
                );
              })}
            </group>
          </group>
        </ThreeCanvas>
      </AbsoluteFill>

        {labels.map((l, i) => {
          const pop = spring({frame: frame - 15 - i * 4, fps, config: {damping: 200}});
          return (
            <div
              key={l.name}
              style={{
                position: 'absolute',
                zIndex: 3,
                left: l.x + 14 * u,
                top: l.y - 34 * u,
                padding: `${4 * u}px ${12 * u}px`,
                borderRadius: 8 * u,
                background: 'rgba(2,6,23,0.7)',
                color: '#ffffff',
                fontSize: 26 * u,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                opacity: l.opacity * pop,
                ...labelStyle,
              }}
            >
              {l.name}
            </div>
          );
        })}

      {title ? (
        <h2
          style={{
            position: 'absolute',
            zIndex: 3,
            top: pad,
            left: pad * 1.6,
            right: pad * 1.6,
            margin: 0,
            height: titleH,
            display: 'flex',
            alignItems: 'center',
            fontSize: 76 * u,
            fontWeight: 800,
            color: theme.text,
            ...entrance('fade-up', frame, fps, u),
            ...titleStyle,
          }}
        >
          {title}
        </h2>
      ) : null}

      {caption ? (
        <p
          style={{
            position: 'absolute',
            zIndex: 3,
            bottom: pad,
            left: pad,
            right: pad,
            height: captionH,
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            fontSize: 42 * u,
            color: theme.muted,
            ...entrance('fade-up', frame - 30, fps, u),
            ...captionStyle,
          }}
        >
          {caption}
        </p>
      ) : null}
    </AbsoluteFill>
  );
};

/** Places the camera and shifts the view so the globe centre sits `offsetY` px below the frame centre. */
const aimCamera = (cam: THREE.PerspectiveCamera, z: number, w: number, h: number, offsetY: number) => {
  cam.position.set(0, 0, z);
  cam.setViewOffset(w, h, 0, -offsetY, w, h);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
};

/** Applies aimCamera to the R3F camera every frame (the `camera` prop only sets it once). */
const CameraRig: React.FC<{z: number; width: number; height: number; offsetY: number}> = ({z, width, height, offsetY}) => {
  const cam = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  aimCamera(cam, z, width, height, offsetY);
  return null;
};

/** Frames a follow-mode GlobeScene needs to finish all its routes. */
export const globeSceneFrames = (p: GlobeSceneProps): number => {
  const n = p.routes?.length ?? p.links?.length ?? 0;
  if ((p.camera ?? 'follow') === 'follow') {
    return (p.startAt ?? 20) + n * ((p.travelFrames ?? 70) + (p.holdFrames ?? 20) + (p.returnFrames ?? 25)) + 30;
  }
  return (p.startAt ?? 20) + n * (p.linkStagger ?? 12) + (p.drawFrames ?? 30) + 2 * (p.packetFrames ?? 50);
};

export const globeSceneSchema = z.object({
surface: z.enum(['satellite','political']).optional(),
indiaBoundary: z.enum(['official','natural-earth']).optional(),
routes:z.array(z.object({from:z.string(),to:z.string()})).optional(),
links:z.array(z.tuple([z.string(),z.string()])).optional(),
cities:z.array(z.object({name:z.string(),lat:z.number().min(-90).max(90),lon:z.number().min(-180).max(180)})).optional(),
camera:z.enum(['follow','overview']).optional(),
highlightCountries:z.array(z.string()).optional(),
title:z.string().optional(),
caption:z.string().optional(),
oceanColor:z.string().optional(),
landColor:z.string().optional(),
highlightColor:z.string().optional(),
borderColor:z.string().optional(),
arcColor:z.string().optional(),
packetColor:z.string().optional(),
showLabels:z.boolean().optional(),
highlightRouteCountries:z.boolean().optional(),
keepTraffic:z.boolean().optional(),
bidirectional:z.boolean().optional(),
showAtmosphere:z.boolean().optional(),
showStars:z.boolean().optional(),
startAt:z.number().int().nonnegative().optional(),
holdFrames:z.number().int().nonnegative().optional(),
linkStagger:z.number().int().nonnegative().optional(),
travelFrames:z.number().int().positive().optional(),
returnFrames:z.number().int().positive().optional(),
drawFrames:z.number().int().positive().optional(),
packetFrames:z.number().int().positive().optional(),
spinSpeed:z.number().optional(),
cameraDistance:z.number().min(3).optional(),
zoomOnTravel:z.number().min(0).max(1).optional(),
titleStyle:z.record(z.string(),z.unknown()).optional(),
captionStyle:z.record(z.string(),z.unknown()).optional(),
labelStyle:z.record(z.string(),z.unknown()).optional()
});
export const description = 'A satellite globe with official India boundaries, animated routes, and a follow camera.';
export const tags = ['globe','WAN','geography','routes'];
