import type {FC} from 'react';
import {useMemo} from 'react';
import * as THREE from 'three';
import {Cyl, RBox, Rod, Tor, Tube, type Look} from '../parts';

type M = FC<{look: Look}>;
const on = (look: Look) => look.state !== 'off';

/* ------------------------------------------------------------------ proportions */

/** A low, long grand-tourer. Grounded at y = 0, nose pointing +x. */
const HALF_LENGTH = 1.03;
const FLOOR = 0.1;
const WHEEL_R = 0.18;
const WHEEL_Y = WHEEL_R;
const WHEEL_X = 0.64;
const WHEEL_Z = 0.34;
const ARCH_R = 0.21;
const ARCH_Y = 0.155;
const BELT = 0.535;

/* --------------------------------------------------------------- body profiles */

type Key = [number, number];
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Catmull-Rom through (x, y) keys, sampled at arbitrary x. */
const spline = (keys: Key[]) => (x: number) => {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  let i = 0;
  while (i < keys.length - 2 && x > keys[i + 1][0]) i++;
  const p0 = keys[Math.max(0, i - 1)];
  const p1 = keys[i];
  const p2 = keys[i + 1];
  const p3 = keys[Math.min(keys.length - 1, i + 2)];
  const dx = p2[0] - p1[0];
  const t = (x - p1[0]) / dx;
  const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0])) * dx;
  const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0])) * dx;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
};

/** Roof / hood / trunk top. */
const topAt = spline([
  [-1.03, 0.405],
  [-0.99, 0.45],
  [-0.93, 0.49],
  [-0.84, 0.515],
  [-0.72, 0.55],
  [-0.63, 0.60],
  [-0.54, 0.675],
  [-0.45, 0.73],
  [-0.36, 0.757],
  [-0.22, 0.77],
  [-0.05, 0.774],
  [0.08, 0.767],
  [0.18, 0.73],
  [0.27, 0.665],
  [0.36, 0.605],
  [0.44, 0.565],
  [0.55, 0.548],
  [0.7, 0.527],
  [0.84, 0.5],
  [0.92, 0.465],
  [0.97, 0.43],
  [1.0, 0.405],
  [1.03, 0.39],
]);

/** Widest half-width at the waistline. */
const widthAt = spline([
  [-1.03, 0.3],
  [-0.99, 0.335],
  [-0.92, 0.37],
  [-0.83, 0.398],
  [-0.72, 0.414],
  [-0.62, 0.417],
  [-0.46, 0.411],
  [-0.25, 0.403],
  [-0.02, 0.4],
  [0.2, 0.404],
  [0.44, 0.411],
  [0.62, 0.417],
  [0.75, 0.411],
  [0.86, 0.394],
  [0.94, 0.368],
  [0.99, 0.337],
  [1.03, 0.3],
]);

/** Half-width of the top surface (roof, hood, trunk). */
const topWidthAt = spline([
  [-1.03, 0.205],
  [-0.98, 0.245],
  [-0.9, 0.285],
  [-0.8, 0.312],
  [-0.7, 0.327],
  [-0.58, 0.318],
  [-0.47, 0.312],
  [-0.36, 0.308],
  [-0.22, 0.305],
  [-0.08, 0.304],
  [0.06, 0.305],
  [0.14, 0.309],
  [0.24, 0.316],
  [0.36, 0.322],
  [0.5, 0.326],
  [0.64, 0.335],
  [0.78, 0.322],
  [0.9, 0.295],
  [0.97, 0.255],
  [1.03, 0.205],
]);

/** Wheel-arch rise. Smooth at the rocker, circular over the tire. */
const archBottom = (x: number, cx: number) => {
  const dx = x - cx;
  if (Math.abs(dx) >= ARCH_R) return FLOOR;
  return Math.max(FLOOR, ARCH_Y + Math.sqrt(ARCH_R * ARCH_R - dx * dx));
};
const bottomAt = (x: number) => Math.max(archBottom(x, -WHEEL_X), archBottom(x, WHEEL_X));
const bottomWidthAt = (x: number) => widthAt(x) * 0.95;

/* ------------------------------------------------------------ cross-section math */

const N_TOP = 4;
const N_BOTTOM = 8;
const N_SIDE = 6.5;

/** One point on the body's rounded cross-section. theta = 0 is the right waist. */
const sectionPoint = (x: number, theta: number, out = new THREE.Vector3()) => {
  const yb = bottomAt(x);
  const yt = topAt(x);
  const w = widthAt(x);
  const wt = topWidthAt(x);
  const yc = (yb + yt) / 2;
  const h = (yt - yb) / 2;
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const sy = Math.sign(s) * Math.pow(Math.abs(s), 2 / (s >= 0 ? N_TOP : N_BOTTOM));
  const sz = Math.sign(c) * Math.pow(Math.abs(c), 2 / N_SIDE);
  const y = yc + h * sy;
  const u = h > 1e-6 ? (y - yc) / h : 0;
  const W = u <= 0 ? w * (0.95 + 0.05 * (1 + u)) : w + (wt - w) * smooth(u);
  return out.set(x, y, W * sz);
};

/** Side-surface z at a given (x, y). Positive = right side. */
const sideZ = (x: number, y: number) => {
  const yb = bottomAt(x);
  const yt = topAt(x);
  const yc = (yb + yt) / 2;
  const h = Math.max(1e-5, (yt - yb) / 2);
  const s = THREE.MathUtils.clamp((y - yc) / h, -0.999, 0.999);
  const up = s >= 0;
  const sinTheta = Math.sign(s) * Math.pow(Math.abs(s), (up ? N_TOP : N_BOTTOM) / 2);
  const c = Math.cos(Math.asin(THREE.MathUtils.clamp(sinTheta, -0.999, 0.999)));
  const sz = Math.pow(Math.max(0, c), 2 / N_SIDE);
  const w = widthAt(x);
  const wt = topWidthAt(x);
  const W = s <= 0 ? w * (0.95 + 0.05 * (1 + s)) : w + (wt - w) * smooth(s);
  return W * sz;
};

/* --------------------------------------------------------------- mesh builders */

const BODY_STATIONS = 97;
const RING_POINTS = 56;

const buildBody = () => {
  const positions: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i < BODY_STATIONS; i++) {
    const x = -HALF_LENGTH + (2 * HALF_LENGTH * i) / (BODY_STATIONS - 1);
    for (let j = 0; j < RING_POINTS; j++) {
      sectionPoint(x, (j / RING_POINTS) * Math.PI * 2, p);
      positions.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < BODY_STATIONS - 1; i++) {
    for (let j = 0; j < RING_POINTS; j++) {
      const j2 = (j + 1) % RING_POINTS;
      const a = i * RING_POINTS + j;
      const b = i * RING_POINTS + j2;
      const c = (i + 1) * RING_POINTS + j;
      const d = (i + 1) * RING_POINTS + j2;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
};

const buildCap = (x: number) => {
  const positions: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();
  const yc = (bottomAt(x) + topAt(x)) / 2;
  positions.push(x, yc, 0);
  for (let j = 0; j < RING_POINTS; j++) {
    sectionPoint(x, (j / RING_POINTS) * Math.PI * 2, p);
    positions.push(p.x, p.y, p.z);
  }
  for (let j = 0; j < RING_POINTS; j++) {
    indices.push(0, 1 + j, 1 + ((j + 1) % RING_POINTS));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
};

/**
 * A curved patch on the side of the body. The corners are (xFront/xRear at the
 * beltline and at the roof), so the front/rear edges can lean like real pillars.
 */
const buildSideGlass = (
  sideSign: 1 | -1,
  xFb: number,
  xFt: number,
  xRb: number,
  xRt: number,
  yB: number,
  yT: number,
  lift: number,
  nu = 16,
  nv = 9,
) => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let iv = 0; iv <= nv; iv++) {
    const v = iv / nv;
    const y = THREE.MathUtils.lerp(yB, yT, v);
    const xF = THREE.MathUtils.lerp(xFb, xFt, v);
    const xR = THREE.MathUtils.lerp(xRb, xRt, v);
    for (let iu = 0; iu <= nu; iu++) {
      const x = THREE.MathUtils.lerp(xF, xR, iu / nu);
      positions.push(x, y, sideSign * (sideZ(x, y) + lift));
    }
  }
  const row = nu + 1;
  for (let iv = 0; iv < nv; iv++) {
    for (let iu = 0; iu < nu; iu++) {
      const a = iv * row + iu;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
};

/** Windshield / rear screen: a patch wrapped around the top of the body. */
const buildTopGlass = (
  xLow: number,
  xHigh: number,
  phiLow: number,
  phiHigh: number,
  lift: number,
  nu = 22,
  nv = 10,
) => {
  const positions: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();
  for (let iv = 0; iv <= nv; iv++) {
    const v = iv / nv;
    const x = THREE.MathUtils.lerp(xLow, xHigh, v);
    const phi = THREE.MathUtils.lerp(phiLow, phiHigh, v);
    for (let iu = 0; iu <= nu; iu++) {
      const u = -1 + (2 * iu) / nu;
      sectionPoint(x, Math.PI / 2 + u * phi, p);
      positions.push(p.x, p.y + lift, p.z);
    }
  }
  const row = nu + 1;
  for (let iv = 0; iv < nv; iv++) {
    for (let iu = 0; iu < nu; iu++) {
      const a = iv * row + iu;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
};

type P3 = [number, number, number];

/** Points along the top arc at a fixed x, used for window-header trim. */
const topArcPoints = (x: number, phi: number, lift: number): P3[] => {
  const pts: P3[] = [];
  for (let i = 0; i <= 20; i++) {
    const u = -1 + (2 * i) / 20;
    const p = sectionPoint(x, Math.PI / 2 + u * phi);
    pts.push([p.x, p.y + lift, p.z]);
  }
  return pts;
};

/** A short trim line on the side of the body, front-to-back. */
const sideLinePoints = (side: 1 | -1, x0: number, x1: number, y: number, lift: number): P3[] => [
  [x0, y, side * (sideZ(x0, y) + lift)],
  [x1, y, side * (sideZ(x1, y) + lift)],
];

/** A vertical shut line on the side of the body. */
const sideVerticalPoints = (side: 1 | -1, x: number, y0: number, y1: number, lift: number, steps = 14): P3[] => {
  const pts: P3[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = THREE.MathUtils.lerp(y0, y1, i / steps);
    pts.push([x, y, side * (sideZ(x, y) + lift)]);
  }
  return pts;
};

/** A long character line following the curved side of the body. */
const sideCurvePoints = (side: 1 | -1, x0: number, x1: number, y: number, lift: number, steps = 30): P3[] => {
  const pts: P3[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = THREE.MathUtils.lerp(x0, x1, i / steps);
    pts.push([x, y, side * (sideZ(x, y) + lift)]);
  }
  return pts;
};

/** A shut line on the top surface (hood or trunk edge), following the shoulder. */
const topSeamPoints = (x0: number, x1: number, phi: number, side: 1 | -1, lift: number, steps = 18): P3[] => {
  const pts: P3[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = THREE.MathUtils.lerp(x0, x1, i / steps);
    const p = sectionPoint(x, Math.PI / 2 - side * phi);
    pts.push([p.x, p.y + lift, p.z]);
  }
  return pts;
};

/* ------------------------------------------------------------------- wheel bits */

const tireGeo = (() => {
  const profile = [
    new THREE.Vector2(0.095, -0.066),
    new THREE.Vector2(0.14, -0.066),
    new THREE.Vector2(0.167, -0.057),
    new THREE.Vector2(0.179, -0.038),
    new THREE.Vector2(0.18, 0),
    new THREE.Vector2(0.179, 0.038),
    new THREE.Vector2(0.167, 0.057),
    new THREE.Vector2(0.14, 0.066),
    new THREE.Vector2(0.095, 0.066),
  ];
  const g = new THREE.LatheGeometry(profile, 48);
  g.rotateX(Math.PI / 2);
  return g;
})();

const linerGeo = (() => {
  const g = new THREE.CylinderGeometry(0.213, 0.213, 0.8, 32, 1, true, Math.PI / 2, Math.PI);
  g.rotateX(Math.PI / 2);
  return g;
})();

const Wheel: FC<{x: number; z: number; side: 1 | -1; spin: number}> = ({x, z, side, spin}) => (
  <group position={[x, WHEEL_Y, z]}>
    <group rotation={[0, 0, spin]}>
      <mesh geometry={tireGeo}>
        <meshStandardMaterial color="#08090b" roughness={0.95} metalness={0.02} />
      </mesh>
      {[-0.027, 0.027].map((zo) => (
        <mesh key={zo} position={[0, 0, zo]}>
          <torusGeometry args={[0.176, 0.0035, 8, 48]} />
          <meshStandardMaterial color="#030405" roughness={0.98} />
        </mesh>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.112, 0.112, 0.112, 36, 1, true]} />
        <meshPhysicalMaterial color="#181a1e" metalness={0.7} roughness={0.55} side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0, s * 0.052]}>
          <mesh position={[0, 0, s * 0.001]}>
            <torusGeometry args={[0.115, 0.0055, 10, 48]} />
            <meshPhysicalMaterial color="#8f969f" metalness={1} roughness={0.32} />
          </mesh>
          {Array.from({length: 5}, (_, i) => (
            <group key={i} rotation={[0, 0, (i / 5) * Math.PI * 2]}>
              <mesh position={[0, 0.06, s * 0.004]}>
                <boxGeometry args={[0.023, 0.102, 0.013]} />
                <meshPhysicalMaterial color="#5f6772" metalness={1} roughness={0.4} />
              </mesh>
              <mesh position={[0.009, 0.063, s * 0.0115]} rotation={[0, 0, -0.13]}>
                <boxGeometry args={[0.005, 0.096, 0.002]} />
                <meshPhysicalMaterial color="#a9afb7" metalness={1} roughness={0.28} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 0, s * 0.012]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.012, 24]} />
            <meshPhysicalMaterial color="#7f8791" metalness={1} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, s * 0.019]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.004, 20]} />
            <meshStandardMaterial color="#111317" roughness={0.45} metalness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
    <mesh position={[0, 0, side * 0.025]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.1, 0.1, 0.009, 32]} />
      <meshStandardMaterial color="#454b53" metalness={0.7} roughness={0.6} />
    </mesh>
    <mesh position={[0, 0, side * 0.034]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.042, 0.042, 0.018, 24]} />
      <meshStandardMaterial color="#25282d" metalness={0.65} roughness={0.65} />
    </mesh>
    <RBox
      p={[0.065, 0.055, side * 0.042]}
      rot={[0, 0, 0.65]}
      s={[0.028, 0.055, 0.022]}
      r={0.008}
      color="#a81725"
      mat="plastic"
    />
  </group>
);

/* -------------------------------------------------------------------- the car */

const Paint: FC<{color: string}> = ({color}) => (
  <meshPhysicalMaterial
    color={color}
    metalness={0.38}
    roughness={0.45}
    clearcoat={0.8}
    clearcoatRoughness={0.2}
    envMapIntensity={0.8}
  />
);

const Glass: FC<{geo: THREE.BufferGeometry}> = ({geo}) => (
  <mesh geometry={geo}>
    <meshPhysicalMaterial
      color="#0d141d"
      metalness={0.22}
      roughness={0.035}
      clearcoat={1}
      clearcoatRoughness={0.02}
      envMapIntensity={1.95}
      transparent
      opacity={0.8}
      depthWrite={false}
      side={THREE.DoubleSide}
    />
  </mesh>
);

/** A narrow black pillar laid over the glass seam. */
const Pillar: FC<{geo: THREE.BufferGeometry}> = ({geo}) => (
  <mesh geometry={geo}>
    <meshPhysicalMaterial color="#07090d" roughness={0.12} metalness={0.25} clearcoat={1} clearcoatRoughness={0.05} side={THREE.DoubleSide} />
  </mesh>
);

export const CarModel: M = ({look}) => {
  const paint = look.body ?? '#95141f';
  const lights = on(look) ? 1 : 0;
  const spin = look.state === 'active' ? look.t * 5.5 : 0;

  const bodyGeo = useMemo(buildBody, []);
  const frontCap = useMemo(() => buildCap(HALF_LENGTH), []);
  const rearCap = useMemo(() => buildCap(-HALF_LENGTH), []);
  const doorGlassR = useMemo(() => buildSideGlass(1, 0.33, 0.055, -0.065, -0.125, BELT, 0.722, 0.006), []);
  const doorGlassL = useMemo(() => buildSideGlass(-1, 0.33, 0.055, -0.065, -0.125, BELT, 0.722, 0.006), []);
  const quarterGlassR = useMemo(() => buildSideGlass(1, -0.12, -0.17, -0.60, -0.43, BELT, 0.718, 0.006), []);
  const quarterGlassL = useMemo(() => buildSideGlass(-1, -0.12, -0.17, -0.60, -0.43, BELT, 0.718, 0.006), []);
  const windshield = useMemo(() => buildTopGlass(0.43, 0.095, 0.72, 0.63, 0.008), []);
  const rearGlass = useMemo(() => buildTopGlass(-0.65, -0.355, 0.78, 0.7, 0.008), []);

  const beltPoints = useMemo(() => {
    const make = (side: 1 | -1) => {
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 24; i++) {
        const x = 0.35 - (0.99 * i) / 24;
        const z = sideZ(x, BELT);
        pts.push([x, BELT + 0.001, side * (z + 0.006)]);
      }
      return pts;
    };
    return {r: make(1), l: make(-1)};
  }, []);

  const pillarR = useMemo(() => buildSideGlass(1, -0.065, -0.118, -0.125, -0.175, BELT, 0.724, 0.011), []);
  const pillarL = useMemo(() => buildSideGlass(-1, -0.065, -0.118, -0.125, -0.175, BELT, 0.724, 0.011), []);
  const headerTrim = useMemo(() => topArcPoints(0.095, 0.63, 0.012), []);
  const rearHeaderTrim = useMemo(() => topArcPoints(-0.355, 0.63, 0.012), []);
  const windshieldSeal = useMemo(() => topArcPoints(0.44, 0.72, 0.01), []);
  const sideHeaderR = useMemo(() => sideLinePoints(1, 0.055, -0.125, 0.724, 0.008), []);
  const sideHeaderL = useMemo(() => sideLinePoints(-1, 0.055, -0.125, 0.724, 0.008), []);

  const archLips = useMemo(() => {
    const make = (xc: number, side: 1 | -1): P3[] => {
      const pts: P3[] = [];
      for (let i = 0; i <= 22; i++) {
        const t = (Math.PI * i) / 22;
        const x = xc + ARCH_R * Math.cos(t);
        const y = ARCH_Y + ARCH_R * Math.sin(t) + 0.001;
        pts.push([x, y, side * (bottomWidthAt(x) + 0.003)]);
      }
      return pts;
    };
    return [-WHEEL_X, WHEEL_X].map((xc) => ({r: make(xc, 1), l: make(xc, -1)}));
  }, []);

  const doorSeams = useMemo(
    () =>
      ([-1, 1] as const).flatMap((side) =>
        [0.385, -0.385].map((x) => sideVerticalPoints(side, x, 0.12, BELT, 0.003)),
      ),
    [],
  );
  const hoodSeams = useMemo(
    () => ([-1, 1] as const).map((side) => topSeamPoints(0.43, 0.95, 0.8, side, 0.0025)),
    [],
  );
  const trunkSeams = useMemo(
    () => ([-1, 1] as const).map((side) => topSeamPoints(-0.65, -0.99, 0.82, side, 0.0025)),
    [],
  );
  const creaseR = useMemo(() => sideCurvePoints(1, 0.95, -0.95, 0.39, 0.002), []);
  const creaseL = useMemo(() => sideCurvePoints(-1, 0.95, -0.95, 0.39, 0.002), []);

  return (
    <group>
      {/* main body shell */}
      <mesh geometry={bodyGeo}>
        <Paint color={paint} />
      </mesh>
      {[frontCap, rearCap].map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshPhysicalMaterial
            color={paint}
            metalness={0.38}
            roughness={0.45}
            clearcoat={0.8}
            clearcoatRoughness={0.2}
            envMapIntensity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* glazing */}
      <Glass geo={windshield} />
      <Glass geo={rearGlass} />
      <Glass geo={doorGlassR} />
      <Glass geo={doorGlassL} />
      <Glass geo={quarterGlassR} />
      <Glass geo={quarterGlassL} />
      <Pillar geo={pillarR} />
      <Pillar geo={pillarL} />

      {/* window trim */}
      <Tube points={beltPoints.r} r={0.0026} color="#a2a9b1" mat="metal" />
      <Tube points={beltPoints.l} r={0.0026} color="#a2a9b1" mat="metal" />
      <Tube points={sideHeaderR} r={0.0025} color="#0a0c10" mat="matte" />
      <Tube points={sideHeaderL} r={0.0025} color="#0a0c10" mat="matte" />
      <Tube points={headerTrim} r={0.0024} color="#14181f" mat="matte" />
      <Tube points={rearHeaderTrim} r={0.0024} color="#14181f" mat="matte" />
      <Tube points={windshieldSeal} r={0.0032} color="#0a0c10" mat="matte" />

      {/* wheel wells and arch lips */}
      {[-WHEEL_X, WHEEL_X].map((x) => (
        <mesh key={x} geometry={linerGeo} position={[x, ARCH_Y, 0]}>
          <meshStandardMaterial color="#050607" roughness={0.98} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {archLips.map(({r, l}, i) => (
        <group key={i}>
          <Tube points={r} r={0.0025} color="#0b0c0f" mat="matte" />
          <Tube points={l} r={0.0025} color="#0b0c0f" mat="matte" />
        </group>
      ))}

      {/* side sills, underbody and shut lines */}
      <RBox p={[0, 0.097, 0]} s={[0.82, 0.006, 0.76]} r={0.003} color="#0a0b0e" mat="matte" />
      <RBox p={[0, 0.098, 0]} s={[1.72, 0.018, 0.64]} r={0.01} color="#050607" mat="matte" />
      <RBox p={[0.99, 0.096, 0]} s={[0.11, 0.008, 0.5]} r={0.004} color="#0a0b0e" mat="matte" />
      <RBox p={[-0.99, 0.096, 0]} s={[0.11, 0.008, 0.5]} r={0.004} color="#0a0b0e" mat="matte" />

      {doorSeams.map((pts, i) => (
        <Tube key={i} points={pts} r={0.0022} color="#080a0d" mat="matte" />
      ))}
      <Tube points={creaseR} r={0.0035} color={paint} mat="paint" />
      <Tube points={creaseL} r={0.0035} color={paint} mat="paint" />
      {hoodSeams.map((pts, i) => (
        <Tube key={i} points={pts} r={0.0013} color="#1e2126" mat="matte" />
      ))}
      {trunkSeams.map((pts, i) => (
        <Tube key={i} points={pts} r={0.0013} color="#1e2126" mat="matte" />
      ))}

      {[-1, 1].map((s) => (
        <group key={s}>
          {/* flush door handle */}
          <RBox
            p={[-0.14, 0.492, s * (sideZ(-0.14, 0.492) + 0.002)]}
            s={[0.135, 0.028, 0.007]}
            r={0.004}
            color="#080a0d"
            mat="matte"
          />
          <RBox
            p={[-0.14, 0.492, s * (sideZ(-0.14, 0.492) + 0.007)]}
            s={[0.115, 0.016, 0.012]}
            r={0.005}
            color={paint}
            mat="paint"
          />
          <RBox
            p={[-0.14, 0.5, s * (sideZ(-0.14, 0.5) + 0.0135)]}
            s={[0.1, 0.003, 0.003]}
            r={0.001}
            color="#b9bfc7"
            mat="metal"
          />
        </group>
      ))}

      {/* fuel filler cap on the rear quarter */}
      {(() => {
        const x = -0.73;
        const y = 0.455;
        const z = sideZ(x, y);
        return (
          <group>
            <Cyl p={[x, y, z + 0.002]} r={0.026} h={0.004} rot={[Math.PI / 2, 0, 0]} color={paint} mat="paint" />
            <Tor p={[x, y, z + 0.0045]} r={0.025} tube={0.0016} color="#080a0d" mat="matte" />
          </group>
        );
      })()}

      {/* mirrors */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <RBox p={[0.347, 0.548, s * 0.348]} s={[0.075, 0.042, 0.034]} r={0.012} color={paint} mat="paint" />
          <Rod
            from={[0.347, 0.548, s * 0.35]}
            to={[0.322, 0.552, s * 0.385]}
            r={0.012}
            color={paint}
            mat="paint"
          />
          <RBox p={[0.305, 0.552, s * 0.4]} s={[0.108, 0.046, 0.075]} r={0.02} color={paint} mat="paint" />
          <RBox p={[0.252, 0.552, s * 0.4]} s={[0.005, 0.034, 0.058]} r={0.003} color="#0a1018" mat="tint" opacity={0.72} />
        </group>
      ))}

      {/* interior silhouettes, kept low behind the dark glass */}
      <RBox p={[0.3, 0.545, 0]} s={[0.17, 0.07, 0.55]} r={0.025} color="#11151b" mat="matte" />
      {[-1, 1].map((s) => (
        <group key={s}>
          <RBox p={[-0.13, 0.43, s * 0.18]} s={[0.24, 0.07, 0.22]} r={0.03} color="#151920" mat="matte" />
          <RBox p={[-0.235, 0.54, s * 0.18]} s={[0.055, 0.22, 0.22]} r={0.028} color="#151920" mat="matte" />
          <RBox p={[-0.235, 0.655, s * 0.18]} s={[0.05, 0.07, 0.13]} r={0.022} color="#10141a" mat="matte" />
        </group>
      ))}
      <Tor p={[0.215, 0.565, 0.18]} r={0.052} tube={0.009} rot={[0, Math.PI / 2, 0]} color="#0c0f14" mat="matte" />
      <Rod from={[0.18, 0.548, 0.18]} to={[0.27, 0.53, 0.18]} r={0.012} color="#0c0f14" mat="matte" />
      <RBox p={[0.115, 0.728, 0]} s={[0.018, 0.028, 0.11]} r={0.008} color="#0b0e13" mat="matte" />
      <Rod from={[0.13, 0.742, 0]} to={[0.13, 0.758, 0]} r={0.006} color="#0b0e13" mat="matte" />

      {/* nose: grille, light band, intakes, badge */}
      <RBox p={[1.031, 0.21, 0]} s={[0.012, 0.085, 0.35]} r={0.018} color="#07090c" mat="matte" />
      {Array.from({length: 8}, (_, i) => (
        <RBox key={i} p={[1.037, 0.21, -0.14 + (0.28 * i) / 7]} s={[0.004, 0.072, 0.005]} r={0.002} color="#1b1f24" mat="matte" />
      ))}
      {[0.18, 0.2, 0.22, 0.24].map((y) => (
        <RBox key={y} p={[1.038, y, 0]} s={[0.004, 0.003, 0.28]} r={0.001} color="#23282f" mat="matte" />
      ))}
      <RBox p={[1.039, 0.247, 0]} s={[0.004, 0.003, 0.3]} r={0.001} color="#69717b" mat="metal" />
      {/* chrome grille surround */}
      <RBox p={[1.038, 0.256, 0]} s={[0.005, 0.004, 0.37]} r={0.002} color="#69717b" mat="metal" />
      <RBox p={[1.038, 0.164, 0]} s={[0.005, 0.004, 0.37]} r={0.002} color="#69717b" mat="metal" />
      {[-1, 1].map((s) => (
        <group key={s}>
          <RBox p={[1.038, 0.21, s * 0.183]} s={[0.005, 0.096, 0.004]} r={0.002} color="#69717b" mat="metal" />
          {/* air curtain at the bumper corner */}
          <RBox p={[1.024, 0.17, s * 0.22]} s={[0.012, 0.06, 0.03]} r={0.012} color="#080a0d" mat="matte" />
        </group>
      ))}
      {/* full-width light band with projector lenses */}
      <RBox p={[1.024, 0.33, 0]} s={[0.014, 0.078, 0.45]} r={0.02} color="#0a0d11" mat="matte" />
      <RBox p={[1.032, 0.352, 0]} s={[0.006, 0.005, 0.4]} r={0.002} color="#dcecff" mat="glow" glow={0.85 * (0.4 + lights)} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <RBox p={[1.032, 0.332, s * 0.215]} s={[0.005, 0.03, 0.004]} r={0.002} color="#dcecff" mat="glow" glow={0.8 * (0.4 + lights)} />
          <Cyl p={[1.033, 0.312, s * 0.155]} r={0.017} h={0.008} rot={[0, 0, Math.PI / 2]} color="#28394b" mat="gloss" />
          <Tor
            p={[1.034, 0.312, s * 0.155]}
            r={0.018}
            tube={0.0018}
            rot={[0, Math.PI / 2, 0]}
            color="#6b7480"
            mat="metal"
          />
        </group>
      ))}
      <RBox p={[1.034, 0.33, 0]} s={[0.004, 0.076, 0.44]} r={0.018} color="#0b1622" mat="tint" opacity={0.38} />
      <RBox p={[1.03, 0.13, 0]} s={[0.012, 0.04, 0.36]} r={0.012} color="#080a0d" mat="matte" />
      <RBox p={[0.995, 0.096, 0]} s={[0.08, 0.014, 0.56]} r={0.006} color="#080a0d" mat="matte" />
      <Cyl p={[1.038, 0.21, 0]} r={0.014} h={0.007} rot={[0, 0, Math.PI / 2]} color="#c8cdd4" mat="metal" />
      <Cyl p={[1.042, 0.21, 0]} r={0.008} h={0.003} rot={[0, 0, Math.PI / 2]} color="#1a1d22" mat="matte" />

      {/* tail: full-width light bar, plate recess, diffuser, exhausts */}
      <RBox p={[-1.031, 0.355, 0]} s={[0.012, 0.058, 0.46]} r={0.014} color="#080a0d" mat="matte" />
      <RBox p={[-1.039, 0.355, 0]} s={[0.006, 0.016, 0.43]} r={0.006} color="#d01224" mat="glow" glow={0.6 * (0.4 + lights)} />
      {[-1, 1].map((s) => (
        <RBox
          key={s}
          p={[-1.039, 0.355, s * 0.205]}
          s={[0.006, 0.05, 0.03]}
          r={0.01}
          color="#e01a2a"
          mat="glow"
          glow={0.55 * (0.4 + lights)}
        />
      ))}
      <RBox p={[-1.026, 0.128, 0]} s={[0.02, 0.062, 0.44]} r={0.012} color="#07090c" mat="matte" />
      {[-0.15, -0.09, -0.03, 0.03, 0.09, 0.15].map((z) => (
        <RBox key={z} p={[-1.037, 0.126, z]} s={[0.008, 0.05, 0.007]} r={0.002} color="#2d3137" mat="matte" />
      ))}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Cyl p={[-1.038, 0.126, s * 0.165]} r={0.026} h={0.03} rot={[0, 0, Math.PI / 2]} color="#8a919a" mat="metal" />
          <Cyl p={[-1.051, 0.126, s * 0.165]} r={0.019} h={0.008} rot={[0, 0, Math.PI / 2]} color="#050607" mat="matte" />
          <RBox p={[-1.036, 0.165, s * 0.225]} s={[0.005, 0.012, 0.016]} r={0.003} color="#d8202f" mat="glow" glow={0.35 * lights} />
        </group>
      ))}
      <RBox p={[-1.028, 0.24, 0]} s={[0.01, 0.068, 0.21]} r={0.008} color="#090b0e" mat="matte" />
      <RBox p={[-1.035, 0.24, 0]} s={[0.004, 0.046, 0.16]} r={0.004} color="#b6bcc3" mat="matte" />
      <RBox p={[-1.0385, 0.24, 0.058]} s={[0.002, 0.042, 0.024]} r={0.001} color="#1c4c93" mat="matte" />
      {[-0.035, -0.01, 0.015, 0.04].map((z) => (
        <RBox key={z} p={[-1.0385, 0.24, z]} s={[0.002, 0.011, 0.007]} r={0.001} color="#2b3036" mat="matte" />
      ))}
      <Cyl p={[-1.034, 0.298, 0]} r={0.012} h={0.004} rot={[0, 0, Math.PI / 2]} color="#b9bfc7" mat="metal" />
      <Tube points={[[-1.034, 0.168, -0.255], [-1.034, 0.168, 0.255]]} r={0.0016} color="#14161a" mat="matte" />

      {/* roof fin */}
      <RBox p={[-0.34, 0.764, 0]} s={[0.13, 0.008, 0.03]} r={0.004} color="#0b0d11" mat="matte" />
      <RBox p={[-0.35, 0.774, 0]} rot={[0, 0, -0.1]} s={[0.1, 0.02, 0.02]} r={0.008} color="#0b0d11" mat="matte" />

      {/* wheels */}
      <Wheel x={-WHEEL_X} z={WHEEL_Z} side={1} spin={spin} />
      <Wheel x={WHEEL_X} z={WHEEL_Z} side={1} spin={spin} />
      <Wheel x={-WHEEL_X} z={-WHEEL_Z} side={-1} spin={spin} />
      <Wheel x={WHEEL_X} z={-WHEEL_Z} side={-1} spin={spin} />
    </group>
  );
};
