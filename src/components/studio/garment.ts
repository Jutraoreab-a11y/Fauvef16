import * as THREE from 'three';
import {
  collarHeightFrom,
  defaultGarmentOptions,
  HALF_ZIP_BOTTOM,
  buttonHeights,
  garmentBottomFromLength,
  pocketQuads,
  type GarmentOptions,
} from './garment-options';

/**
 * Géométrie du gilet et du mannequin, construites à partir du même squelette.
 *
 * Le vêtement n'est plus un assemblage de primitives posées à côté du mannequin :
 * chaque pièce est une enveloppe calculée sur la section du torse (largeur, profondeur
 * à chaque hauteur) ou sur l'axe du bras, avec une aisance ajoutée. Les zones restent
 * donc collées au corps quand on change l'ampleur, la longueur ou la hauteur du col.
 */

export interface ProductPart {
  id: string;
  zone: string;
  geometry: THREE.BufferGeometry;
}

interface Section {
  a: number; // demi-largeur (axe x)
  b: number; // demi-profondeur (axe z, +z = face avant)
}

type SectionFn = (y: number) => Section;

/** Squelette commun au mannequin et au vêtement (unités de la scène). */
export const BODY = {
  hipY: -1.32,
  shoulderY: 0.74,
  neckY: 1.04,
  neck: { a: 0.16, b: 0.15 },
  armJoint: { x: 0.56, y: 0.66 },
  armAngle: 0.3, // écart du bras par rapport à la verticale (pose en A)
  wristT: 1.12, // distance épaule → poignet le long du bras
  handT: 1.36,
  headY: 1.5,
};

// Coupe du torse, du bassin à la ligne d'épaule : [y, demi-largeur, demi-profondeur].
const TORSO_PROFILE: [number, number, number][] = [
  [-1.32, 0.5, 0.31],
  [-1.05, 0.53, 0.32],
  [-0.6, 0.49, 0.3],
  [-0.2, 0.47, 0.29],
  [0.2, 0.52, 0.32],
  [0.5, 0.56, 0.34],
  [0.74, 0.58, 0.31],
];

export const TORSO_EXPONENT = 2.3; // > 2 : section légèrement « carrée », plus proche d'un buste
const FRONT = Math.PI / 2; // angle de la face avant (+z)

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

function profileAt(y: number): Section {
  const rows = TORSO_PROFILE;
  if (y <= rows[0][0]) return { a: rows[0][1], b: rows[0][2] };
  for (let index = 1; index < rows.length; index += 1) {
    const [y1, a1, b1] = rows[index];
    if (y <= y1) {
      const [y0, a0, b0] = rows[index - 1];
      const t = smooth((y - y0) / (y1 - y0));
      return { a: lerp(a0, a1, t), b: lerp(b0, b1, t) };
    }
  }
  const last = rows[rows.length - 1];
  return { a: last[1], b: last[2] };
}

/** Pente d'épaule : de la ligne d'épaule jusqu'à la base du cou. */
function dome(y: number, shoulder: Section, neck: Section): Section {
  const s = clamp01((y - BODY.shoulderY) / (BODY.neckY - BODY.shoulderY));
  const p = 2.2;
  const f = Math.pow(1 - Math.pow(s, p), 1 / p);
  return { a: lerp(neck.a, shoulder.a, f), b: lerp(neck.b, shoulder.b, f) };
}

export function torsoSection(y: number): Section {
  if (y <= BODY.shoulderY) return profileAt(y);
  return dome(y, profileAt(BODY.shoulderY), BODY.neck);
}

export interface GarmentValues {
  boxy: number;
  longueur: number;
  col_hauteur: number;
  /** Longueur des manches : 0 = courtes (mi-bras), 100 = au poignet. */
  manches: number;
}

export function readGarmentValues(values: Record<string, number>): GarmentValues {
  return {
    boxy: values.boxy ?? 40,
    longueur: values.longueur ?? 55,
    col_hauteur: values.col_hauteur ?? 30,
    manches: values.manches ?? 100,
  };
}

/** Section du gilet : torse + aisance ; l'ampleur redresse la taille et élargit l'épaule. */
export function garmentSectionFn(values: GarmentValues): SectionFn {
  const boxyT = clamp01(values.boxy / 100);
  const ease = 0.045 + boxyT * 0.05;
  const chest = profileAt(0.5);
  const body = (y: number): Section => {
    const base = profileAt(y);
    // Plus la coupe est ample, plus le vêtement tombe droit depuis la poitrine.
    const straighten = y < 0.5 ? boxyT * 0.95 : 0;
    const a = lerp(base.a, Math.max(base.a, chest.a), straighten);
    const b = lerp(base.b, Math.max(base.b, chest.b), straighten);
    return { a: a + ease + boxyT * 0.03, b: b + ease * 0.85 };
  };
  const shoulder = body(BODY.shoulderY);
  const neck = { a: BODY.neck.a + 0.045, b: BODY.neck.b + 0.045 };
  return (y) => (y <= BODY.shoulderY ? body(y) : dome(y, shoulder, neck));
}

export function garmentBottom(values: GarmentValues): number {
  return garmentBottomFromLength(values.longueur);
}

/** Point de la surface pour un angle θ (θ = π/2 : milieu devant). */
function sectionPoint(section: Section, theta: number, offset: number, exponent: number) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const e = 2 / exponent;
  return new THREE.Vector3(
    (section.a + offset) * Math.sign(c) * Math.pow(Math.abs(c), e),
    0,
    (section.b + offset) * Math.sign(s) * Math.pow(Math.abs(s), e),
  );
}

function surfacePoint(fn: SectionFn, theta: number, y: number, offset: number, exponent = TORSO_EXPONENT) {
  const point = sectionPoint(fn(y), theta, offset, exponent);
  point.y = y;
  return point;
}

/** Normale approchée d'une section elliptique (suffisante pour orienter boutons et patchs). */
function surfaceNormal(fn: SectionFn, theta: number, y: number) {
  const section = fn(y);
  const point = sectionPoint(section, theta, 0, TORSO_EXPONENT);
  return new THREE.Vector3(point.x / (section.a * section.a), 0, point.z / (section.b * section.b)).normalize();
}

interface SurfaceOptions {
  y0: number;
  y1: number;
  rows: number;
  theta0?: number;
  theta1?: number;
  cols?: number;
  offset?: number;
  exponent?: number;
}

/** Surface balayée : une section par hauteur, de y0 à y1. */
function sweptSurface(fn: SectionFn, options: SurfaceOptions): THREE.BufferGeometry {
  const {
    y0, y1, rows,
    theta0 = -Math.PI / 2, // couture au milieu dos
    theta1 = (3 * Math.PI) / 2,
    cols = 72,
    offset = 0,
    exponent = TORSO_EXPONENT,
  } = options;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= rows; row += 1) {
    const y = lerp(y0, y1, row / rows);
    const section = fn(y);
    for (let col = 0; col <= cols; col += 1) {
      const theta = lerp(theta0, theta1, col / cols);
      const point = sectionPoint(section, theta, offset, exponent);
      positions.push(point.x, y, point.z);
      uvs.push((theta - theta0) / (2 * Math.PI), y / 3.4);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const a = row * (cols + 1) + col;
      const b = a + cols + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Tube à rayon variable le long d'un axe droit (bras, manche, poignet). */
function taperedTube(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  samples: [number, number][],
  depthScale = 0.92,
  segments = 40,
): THREE.BufferGeometry {
  const axis = direction.clone().normalize();
  const side = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1)).normalize();
  const depth = new THREE.Vector3().crossVectors(side, axis).normalize();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  samples.forEach(([t, radius]) => {
    const center = origin.clone().addScaledVector(axis, t);
    for (let index = 0; index <= segments; index += 1) {
      const phi = (index / segments) * Math.PI * 2;
      const point = center.clone()
        .addScaledVector(side, Math.cos(phi) * radius)
        .addScaledVector(depth, Math.sin(phi) * radius * depthScale);
      positions.push(point.x, point.y, point.z);
      uvs.push(index / segments, t * 0.9);
    }
  });
  for (let row = 0; row < samples.length - 1; row += 1) {
    for (let col = 0; col < segments; col += 1) {
      const a = row * (segments + 1) + col;
      const b = a + segments + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Calotte arrondie : rayon 0 en `tStart`, rayon `radius` après `height`. */
function capSamples(tStart: number, height: number, radius: number, steps = 8, reverse = false) {
  const samples: [number, number][] = [];
  for (let index = 0; index <= steps; index += 1) {
    const phi = (index / steps) * (Math.PI / 2);
    samples.push(
      reverse
        ? [tStart + height * Math.sin(phi), radius * Math.cos(phi)]
        : [tStart + height * (1 - Math.cos(phi)), radius * Math.sin(phi)],
    );
  }
  return samples;
}

export const armRadius = (t: number) => lerp(0.125, 0.068, clamp01(t / BODY.wristT));

export function armFrame(side: -1 | 1) {
  const joint = new THREE.Vector3(side * BODY.armJoint.x, BODY.armJoint.y, 0);
  const direction = new THREE.Vector3(side * Math.sin(BODY.armAngle), -Math.cos(BODY.armAngle), 0);
  return { joint, direction };
}

/** Courbe fermée (piqûre) passant par des points, rendue en fil fin. */
function stitch(points: THREE.Vector3[], closed: boolean, radius = 0.0055) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.05);
  return new THREE.TubeGeometry(curve, Math.max(24, points.length * 3), radius, 6, closed);
}

/** Bouton rond à quatre trous suggérés par un léger bombé, orienté selon la normale. */
function button(position: THREE.Vector3, normal: THREE.Vector3) {
  const geometry = new THREE.CylinderGeometry(0.042, 0.046, 0.02, 28);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal));
  geometry.translate(position.x, position.y, position.z);
  return geometry;
}

/** Pression posée à plat sur la surface, orientée selon la normale. */
function snap(position: THREE.Vector3, normal: THREE.Vector3) {
  const geometry = new THREE.CylinderGeometry(0.034, 0.036, 0.016, 24);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal));
  geometry.translate(position.x, position.y, position.z);
  return geometry;
}

export interface SleeveLayout {
  joint: THREE.Vector3;
  direction: THREE.Vector3;
  /** Distance de l'emmanchure au poignet. */
  fullLength: number;
  /** Longueur réelle de la manche (réglage « Longueur des manches »). */
  sleeveLength: number;
  /** Part du bras couverte : 0.3 (mi-bras) à 1 (poignet). */
  fraction: number;
  radiusAt: (t: number) => number;
  cuffRadius: number;
}

/** Manche d'un côté (-1 gauche, 1 droite vu de face) : partagée par la 3D et le patron à plat. */
export function sleeveLayout(rawValues: Record<string, number>, side: -1 | 1): SleeveLayout {
  const values = readGarmentValues(rawValues);
  const section = garmentSectionFn(values);
  const boxyT = clamp01(values.boxy / 100);
  const shoulder = section(BODY.shoulderY);
  const arm = armFrame(side);
  const wrist = arm.joint.clone().addScaledVector(arm.direction, BODY.wristT);
  // Tête de manche rentrée sous la ligne d'épaule : pas de bosse au-dessus de l'emmanchure.
  const joint = new THREE.Vector3(side * (shoulder.a - 0.09), BODY.armJoint.y, 0);
  const direction = wrist.clone().sub(joint);
  const fullLength = direction.length();
  direction.normalize();
  const fraction = 0.3 + 0.7 * clamp01(values.manches / 100);
  const sleeveLength = fullLength * fraction;
  const sleeveEase = 0.06 + boxyT * 0.035;
  const radiusAt = (t: number) => armRadius((t / fullLength) * BODY.wristT) + lerp(sleeveEase, 0.045, clamp01(t / fullLength));
  const cuffRadius = armRadius(fraction * BODY.wristT) + 0.032;
  return { joint, direction, fullLength, sleeveLength, fraction, radiusAt, cuffRadius };
}

/** Bilinéaire entre 4 coins (dx, y) : [haut-gauche, haut-droit, bas-droit, bas-gauche]. */
function quadAt(corners: [number, number][], u: number, v: number): [number, number] {
  const [tl, tr, br, bl] = corners;
  const topX = lerp(tl[0], tr[0], u);
  const topY = lerp(tl[1], tr[1], u);
  const botX = lerp(bl[0], br[0], u);
  const botY = lerp(bl[1], br[1], u);
  return [lerp(botX, topX, v), lerp(botY, topY, v)];
}

/** Pièce rapportée qui épouse le corps : le quadrilatère (dx, y) est projeté sur la surface. */
function surfaceQuad(fn: SectionFn, corners: [number, number][], offset: number, cols = 14, rows = 8) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col <= cols; col += 1) {
      const [dx, y] = quadAt(corners, col / cols, row / rows);
      const point = surfacePoint(fn, FRONT - dx, y, offset);
      positions.push(point.x, point.y, point.z);
      uvs.push(dx * 0.5, y / 3.4);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const a = row * (cols + 1) + col;
      const b = a + cols + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Contour de piqûre, légèrement en retrait du bord de la poche. */
function quadOutline(fn: SectionFn, corners: [number, number][], offset: number, inset: number) {
  const points: THREE.Vector3[] = [];
  const edges: [number, number, number, number][] = [
    [0, 1, 1, 1], [1, 1, 1, 0], [1, 0, 0, 0], [0, 0, 0, 1],
  ];
  // Marge relative : le retrait reste constant quelle que soit la taille de la poche.
  const width = Math.max(Math.abs(corners[1][0] - corners[0][0]), Math.abs(corners[2][0] - corners[3][0]), 0.05);
  const height = Math.max(Math.abs(corners[0][1] - corners[3][1]), 0.05);
  const mu = Math.min(0.3, inset / width);
  const mv = Math.min(0.3, inset / height);
  edges.forEach(([u0, v0, u1, v1]) => {
    for (let index = 0; index < 8; index += 1) {
      const t = index / 8;
      const u = lerp(lerp(mu, 1 - mu, u0), lerp(mu, 1 - mu, u1), t);
      const v = lerp(lerp(mv, 1 - mv, v0), lerp(mv, 1 - mv, v1), t);
      const [dx, y] = quadAt(corners, u, v);
      points.push(surfacePoint(fn, FRONT - dx, y, offset));
    }
  });
  return points;
}

/** Capuche : coque autour de la tête, ouverte devant, posée sur la bande d'encolure. */
function hoodGeometry(base: Section, baseY: number): THREE.BufferGeometry {
  const height = BODY.headY + 0.4 - baseY;
  const opening = 0.75;
  const hoodSection: SectionFn = (y) => {
    const s = clamp01((y - baseY) / height);
    const swell = Math.sin(Math.min(1, s * 1.6) * Math.PI / 2);
    const close = Math.pow(1 - Math.pow(s, 2.6), 1 / 2.6);
    const a = lerp(base.a, 0.31, swell) * close;
    const b = lerp(base.b, 0.35, swell) * close;
    return { a: Math.max(a, 0.002), b: Math.max(b, 0.002) };
  };
  return sweptSurface(hoodSection, {
    y0: baseY - 0.005,
    y1: baseY + height,
    rows: 40,
    theta0: FRONT + opening,
    theta1: FRONT + Math.PI * 2 - opening,
    cols: 56,
    exponent: 2,
  }).translate(0, 0, -0.03);
}

export function vestParts(
  rawValues: Record<string, number>,
  options: GarmentOptions = defaultGarmentOptions(),
): ProductPart[] {
  const values = readGarmentValues(rawValues);
  const section = garmentSectionFn(values);
  const bottom = garmentBottom(values);
  const top = BODY.neckY - 0.005;
  const collarHeight = collarHeightFrom(options.collar, values.col_hauteur);
  const boxyT = clamp01(values.boxy / 100);
  const parts: ProductPart[] = [];
  const add = (zone: string, id: string, geometry: THREE.BufferGeometry) => {
    parts.push({ id, zone, geometry });
  };

  // Corps : enveloppe continue du bas jusqu'à l'encolure, épaules comprises.
  add('corps', 'body', sweptSurface(section, { y0: bottom + 0.1, y1: top, rows: 96 }));

  // Bord-côte bas : toujours juste au-dessus du corps (sinon il passe dessous par endroits).
  add('bords', 'ribbing', sweptSurface(section, { y0: bottom, y1: bottom + 0.13, rows: 6, offset: 0.008 }));

  // Col : la bande posée sur l'encolure change selon le style ; la capuche y ajoute son volume.
  const collarBase = section(top);
  const flare = options.collar === 'montant' ? 0.02 : options.collar === 'capuche' ? 0.11 : -0.004;
  const collarSection: SectionFn = (y) => {
    const t = clamp01((y - (top - 0.03)) / collarHeight);
    return { a: collarBase.a + 0.008 + t * flare, b: collarBase.b + 0.008 + t * flare };
  };
  const collarTop = top - 0.03 + collarHeight;
  add('col', 'collar', sweptSurface(collarSection, { y0: top - 0.03, y1: collarTop, rows: 8, exponent: 2.1 }));
  if (options.collar === 'capuche') add('col', 'hood', hoodGeometry(collarSection(collarTop), collarTop));

  // Manches : montées sur l'épaule du vêtement, elles s'arrêtent entre le mi-bras et le poignet.
  ([-1, 1] as const).forEach((side) => {
    const label = side < 0 ? 'left' : 'right';
    const sleeve = sleeveLayout(rawValues, side);
    const { joint, direction, sleeveLength, radiusAt } = sleeve;
    const cuffStart = sleeveLength - 0.12;

    const capHeight = 0.1;
    const sleeveSamples: [number, number][] = capSamples(-capHeight, capHeight, radiusAt(0));
    for (let index = 1; index <= 18; index += 1) {
      const t = (index / 18) * (cuffStart + 0.02);
      sleeveSamples.push([t, radiusAt(t)]);
    }
    add('manches', `${label}-sleeve`, taperedTube(joint, direction, sleeveSamples));

    // Poignet en bord-côte, à la longueur choisie.
    add('bords', `${label}-cuff`, taperedTube(joint, direction, [
      [cuffStart, sleeve.cuffRadius + 0.006],
      [cuffStart + 0.06, sleeve.cuffRadius],
      [sleeveLength + 0.01, sleeve.cuffRadius - 0.004],
    ]));

    // Piqûre d'emmanchure, autour du haut de la manche.
    const ringT = 0.03;
    const ringCenter = joint.clone().addScaledVector(direction, ringT);
    const sideAxis = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 0, 1)).normalize();
    const depthAxis = new THREE.Vector3().crossVectors(sideAxis, direction).normalize();
    const ring: THREE.Vector3[] = [];
    const r = radiusAt(ringT) + 0.004;
    for (let index = 0; index < 32; index += 1) {
      const phi = (index / 32) * Math.PI * 2;
      ring.push(ringCenter.clone()
        .addScaledVector(sideAxis, Math.cos(phi) * r)
        .addScaledVector(depthAxis, Math.sin(phi) * r * 0.92));
    }
    add('couture', `${label}-armhole-stitch`, stitch(ring, true));
  });

  // Fermeture du milieu devant : zip complet, demi-zip, boutons sur une patte, ou rien.
  if (options.closure === 'zip' || options.closure === 'demi_zip') {
    const zipStart = options.closure === 'zip' ? bottom + 0.02 : HALF_ZIP_BOTTOM;
    const zipPoints: THREE.Vector3[] = [];
    for (let index = 0; index <= 40; index += 1) {
      const y = lerp(zipStart, top - 0.04, index / 40);
      zipPoints.push(new THREE.Vector3(0, y, section(y).b + 0.02));
    }
    for (let index = 1; index <= 6; index += 1) {
      const y = lerp(top - 0.04, collarTop - 0.01, index / 6);
      zipPoints.push(new THREE.Vector3(0, y, collarSection(y).b + 0.02));
    }
    add('zip', 'zip', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(zipPoints), 120, 0.013, 8, false));
    const pullerY = Math.max(collarTop - 0.1, top - 0.02);
    add('zip', 'zip-puller', new THREE.BoxGeometry(0.042, 0.1, 0.014)
      .translate(0, pullerY - 0.05, Math.max(collarSection(pullerY).b, section(pullerY - 0.05).b) + 0.035));
    if (options.closure === 'demi_zip') {
      // Arrêt du demi-zip : petite barrette au bas de la fente.
      add('zip', 'zip-stop', new THREE.BoxGeometry(0.06, 0.018, 0.016)
        .translate(0, zipStart, section(zipStart).b + 0.02));
    }
  } else if (options.closure === 'boutons') {
    // Patte de boutonnage : bande de tissu du corps, puis boutons cousus dessus.
    add('corps', 'placket', surfaceQuad(section, [[-0.07, top - 0.02], [0.07, top - 0.02], [0.07, bottom + 0.13], [-0.07, bottom + 0.13]], 0.01, 4, 24));
    add('couture', 'placket-stitch', stitch(quadOutline(section, [[-0.07, top - 0.02], [0.07, top - 0.02], [0.07, bottom + 0.13], [-0.07, bottom + 0.13]], 0.016, 0.018), true));
    buttonHeights(bottom, top).forEach((y, index) => {
      add('boutons', `front-button-${index}`, button(surfacePoint(section, FRONT, y, 0.022), surfaceNormal(section, FRONT, y)));
    });
    if (options.collar === 'montant') {
      const y = top - 0.03 + collarHeight * 0.5;
      add('boutons', 'collar-front-button', button(surfacePoint(collarSection, FRONT, y, 0.016, 2.1), surfaceNormal(collarSection, FRONT, y)));
    }
  }

  // Poches : chaque quadrilatère du repère commun est projeté sur la surface du corps.
  pocketQuads(options.pockets, bottom).forEach((quad) => {
    add('poches', `pocket-${quad.key}`, surfaceQuad(section, quad.corners, 0.014));
    add('couture', `pocket-stitch-${quad.key}`, stitch(quadOutline(section, quad.corners, 0.022, 0.025), true));
    if (quad.flap) {
      add('poches', `pocket-flap-${quad.key}`, surfaceQuad(section, quad.flap, 0.02));
    }
    if (quad.snap) {
      const [dx, y] = quad.snap;
      const theta = FRONT - dx;
      add('boutons', `pocket-snap-${quad.key}`, snap(
        surfacePoint(section, theta, y, quad.flap ? 0.032 : 0.026),
        surfaceNormal(section, theta, y),
      ));
    }
  });

  // Pressions du col montant, de part et d'autre du zip.
  if (options.collar === 'montant') {
    const collarSnapY = top - 0.03 + collarHeight * 0.55;
    [FRONT + 0.42, FRONT - 0.42].forEach((theta, index) => {
      add('boutons', index === 0 ? 'left-collar-button' : 'right-collar-button', snap(
        surfacePoint(collarSection, theta, collarSnapY, 0.012, 2.1),
        surfaceNormal(collarSection, theta, collarSnapY),
      ));
    });
  }

  // Surpiqûre du bas, juste au-dessus du bord-côte.
  const hemLine: THREE.Vector3[] = [];
  for (let index = 0; index < 64; index += 1) {
    hemLine.push(surfacePoint(section, (index / 64) * Math.PI * 2, bottom + 0.15, 0.008));
  }
  add('couture', 'bottom-stitch', stitch(hemLine, true));

  return parts;
}

/** Profondeur de la face avant du gilet en (x, y) : sert à plaquer logos et patchs. */
export function garmentFrontZ(rawValues: Record<string, number>, x: number, y: number): number {
  const values = readGarmentValues(rawValues);
  const fn = garmentSectionFn(values);
  const clampedY = Math.min(Math.max(y, garmentBottom(values)), BODY.neckY);
  const { a, b } = fn(clampedY);
  const ratio = Math.min(Math.abs(x) / a, 0.98);
  const c = Math.pow(ratio, TORSO_EXPONENT / 2);
  const s = Math.sqrt(Math.max(0, 1 - c * c));
  return b * Math.pow(s, 2 / TORSO_EXPONENT);
}

/** Pièces du mannequin, calculées sur le même squelette que le vêtement. */
export function mannequinGeometries(): THREE.BufferGeometry[] {
  const torso = sweptSurface(torsoSection, { y0: BODY.hipY, y1: BODY.neckY, rows: 90, cols: 64 });
  const hip = torsoSection(BODY.hipY);
  const base = new THREE.CircleGeometry(1, 48)
    .scale(hip.a, hip.b, 1)
    .rotateX(Math.PI / 2)
    .translate(0, BODY.hipY, 0);
  const neck = new THREE.CylinderGeometry(BODY.neck.a * 0.92, BODY.neck.a, 0.32, 32, 1, true)
    .scale(1, 1, BODY.neck.b / BODY.neck.a)
    .translate(0, BODY.neckY + 0.12, 0);
  const head = new THREE.SphereGeometry(0.24, 40, 28)
    .scale(0.88, 1.12, 0.98)
    .translate(0, BODY.headY, 0.01);

  const arms = ([-1, 1] as const).map((side) => {
    const { joint, direction } = armFrame(side);
    const samples: [number, number][] = capSamples(-0.12, 0.12, armRadius(0));
    for (let index = 1; index <= 12; index += 1) {
      const t = (index / 12) * BODY.wristT;
      samples.push([t, armRadius(t)]);
    }
    samples.push([BODY.wristT + 0.08, 0.078]);
    samples.push(...capSamples(BODY.wristT + 0.1, BODY.handT - BODY.wristT - 0.1, 0.08, 6, true));
    return taperedTube(joint, direction, samples, 0.9);
  });

  return [torso, base, neck, head, ...arms];
}
