import {
  BODY,
  TORSO_EXPONENT,
  armFrame,
  armRadius,
  garmentBottom,
  garmentSectionFn,
  readGarmentValues,
  sleeveLayout,
  torsoSection,
} from './garment';
import {
  GARMENT_TOP,
  collarHeightFrom,
  defaultGarmentOptions,
  pocketQuads,
  type GarmentOptions,
} from './garment-options';
import type { StudioSpec } from './types';

/**
 * Patron à plat « éclaté », posé sur la silhouette du mannequin (vue de face).
 *
 * Toutes les cotes viennent de la géométrie 3D : chaque pièce est la surface du gilet déroulée
 * (tour de poitrine, de taille, de manche…), puis placée à sa hauteur réelle sur le corps.
 * Les coordonnées sont en unités de la scène 3D, y vers le haut ; la vue SVG inverse y.
 */

type Point = [number, number];

interface Section {
  a: number;
  b: number;
}

export interface FlatPiece {
  id: string;
  zone: string;
  label: string;
  points: Point[][];
  labelAt: Point;
  /** Détail posé sur une autre pièce (poche, patte) : dessiné par-dessus. */
  overlay?: boolean;
}

export interface FlatLevel {
  label: string;
  y: number;
}

export interface FlatHandles {
  hem: Point;
  side: Point;
  sleeve: { point: Point; origin: Point; direction: Point; fullLength: number };
  collar: { point: Point; base: number } | null;
}

export interface FlatLayout {
  pieces: FlatPiece[];
  silhouette: { torso: Point[]; arms: Point[][]; legs: Point[][]; neck: Point[]; head: { cx: number; cy: number; rx: number; ry: number } };
  worn: { zone: string; points: Point[] }[];
  connectors: [Point, Point][];
  levels: FlatLevel[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  handles: FlatHandles;
  readout: { length: string; sleeves: string };
}

export const LEVELS: FlatLevel[] = [
  { label: 'Épaules', y: BODY.shoulderY },
  { label: 'Poitrine', y: 0.42 },
  { label: 'Taille', y: -0.2 },
  { label: 'Hanches', y: -1.05 },
  { label: 'Entrejambe', y: BODY.hipY },
];

const FRONT = Math.PI / 2;
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

function superPoint(section: Section, theta: number): Point {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const e = 2 / TORSO_EXPONENT;
  return [section.a * Math.sign(c) * Math.pow(Math.abs(c), e), section.b * Math.sign(s) * Math.pow(Math.abs(s), e)];
}

/** Longueur de tissu entre le milieu devant et l'angle (FRONT - dx), mesurée sur la section. */
export function arcFromFront(section: Section, dx: number, steps = 32): number {
  let length = 0;
  let previous = superPoint(section, FRONT);
  for (let index = 1; index <= steps; index += 1) {
    const next = superPoint(section, FRONT - (dx * index) / steps);
    length += Math.hypot(next[0] - previous[0], next[1] - previous[1]);
    previous = next;
  }
  return length;
}

function quadBezier(from: Point, control: Point, to: Point, steps = 10): Point[] {
  const out: Point[] = [];
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const u = 1 - t;
    out.push([
      u * u * from[0] + 2 * u * t * control[0] + t * t * to[0],
      u * u * from[1] + 2 * u * t * control[1] + t * t * to[1],
    ]);
  }
  return out;
}

const shift = (points: Point[], dx: number, dy: number): Point[] => points.map(([x, y]) => [x + dx, y + dy]);
const mirror = (points: Point[]): Point[] => points.map(([x, y]) => [-x, y]);

function describeLength(bottom: number): string {
  if (bottom > -0.05) return 'court, au-dessus de la taille';
  if (bottom > -0.35) return 'à la taille';
  if (bottom > -0.9) return 'entre la taille et les hanches';
  if (bottom > -1.18) return 'aux hanches';
  if (bottom > BODY.hipY - 0.05) return 'sous les hanches';
  return 'au haut des cuisses';
}

function describeSleeves(fraction: number): string {
  if (fraction >= 0.95) return 'au poignet';
  if (fraction >= 0.72) return 'à l’avant-bras';
  if (fraction >= 0.5) return 'au coude';
  return 'mi-bras (manches courtes)';
}

export function flatLayout(spec: StudioSpec): FlatLayout {
  const raw = Object.fromEntries(spec.sliders.map(({ id, value }) => [id, value]));
  const values = readGarmentValues(raw);
  const options: GarmentOptions = spec.garment ?? defaultGarmentOptions();
  const section = garmentSectionFn(values);
  const bottom = garmentBottom(values);
  const top = GARMENT_TOP;
  const quarter = (y: number) => arcFromFront(section(y), Math.PI / 2);
  const right = sleeveLayout(raw, 1);
  const pieces: FlatPiece[] = [];

  // ---------------------------------------------------------------------
  // Silhouette du mannequin (face)
  // ---------------------------------------------------------------------
  const torsoRight: Point[] = [];
  for (let index = 0; index <= 40; index += 1) {
    const y = lerp(BODY.hipY, BODY.neckY, index / 40);
    torsoRight.push([torsoSection(y).a, y]);
  }
  const torso = [...torsoRight, ...mirror(torsoRight).reverse()];
  const arms = ([-1, 1] as const).map((side) => {
    const { joint, direction } = armFrame(side);
    const perp: Point = [-direction.y, direction.x];
    const edgeA: Point[] = [];
    const edgeB: Point[] = [];
    for (let index = 0; index <= 16; index += 1) {
      const t = lerp(-0.08, BODY.handT, index / 16);
      const r = t > BODY.wristT ? 0.075 : armRadius(Math.max(0, t));
      const cx = joint.x + direction.x * t;
      const cy = joint.y + direction.y * t;
      edgeA.push([cx + perp[0] * r, cy + perp[1] * r]);
      edgeB.push([cx - perp[0] * r, cy - perp[1] * r]);
    }
    return [...edgeA, ...edgeB.reverse()];
  });
  const legBottom = -1.75;
  const legs = [-1, 1].map((side) => {
    const inner = side * 0.04;
    const outer = side * torsoSection(BODY.hipY).a * 0.98;
    return [
      [inner, BODY.hipY + 0.05],
      [outer, BODY.hipY + 0.05],
      [side * 0.42, legBottom],
      [side * 0.1, legBottom],
    ] as Point[];
  });
  const neck: Point[] = [[-0.15, BODY.neckY - 0.05], [0.15, BODY.neckY - 0.05], [0.14, BODY.neckY + 0.3], [-0.14, BODY.neckY + 0.3]];
  const head = { cx: 0, cy: BODY.headY, rx: 0.21, ry: 0.27 };

  // Vêtement porté, en transparence : on voit où il s'arrête sur le corps.
  const worn: FlatLayout['worn'] = [];
  const wornBody: Point[] = [];
  for (let index = 0; index <= 30; index += 1) {
    const y = lerp(bottom, top, index / 30);
    wornBody.push([section(y).a, y]);
  }
  worn.push({ zone: 'corps', points: [...wornBody, ...mirror(wornBody).reverse()] });
  ([-1, 1] as const).forEach((side) => {
    const sleeve = sleeveLayout(raw, side);
    const perp: Point = [-sleeve.direction.y, sleeve.direction.x];
    const a: Point[] = [];
    const b: Point[] = [];
    for (let index = 0; index <= 12; index += 1) {
      const t = lerp(0, sleeve.sleeveLength, index / 12);
      const r = sleeve.radiusAt(t);
      const cx = sleeve.joint.x + sleeve.direction.x * t;
      const cy = sleeve.joint.y + sleeve.direction.y * t;
      a.push([cx + perp[0] * r, cy + perp[1] * r]);
      b.push([cx - perp[0] * r, cy - perp[1] * r]);
    }
    worn.push({ zone: 'manches', points: [...a, ...b.reverse()] });
  });

  // ---------------------------------------------------------------------
  // Devant et dos : demi-pièce déroulée (milieu devant → couture de côté)
  // ---------------------------------------------------------------------
  const armholeY = BODY.shoulderY - 0.3;
  const shoulderX = Math.abs(right.joint.x) + 0.02;
  const neckX = arcFromFront(section(top), Math.PI / 2);

  const halfBody = (neckDepth: number): Point[] => {
    const points: Point[] = [[0, bottom]];
    for (let index = 0; index <= 12; index += 1) {
      const y = lerp(bottom, armholeY, index / 12);
      points.push([quarter(y), y]);
    }
    const armholeStart: Point = [quarter(armholeY), armholeY];
    const shoulderPoint: Point = [shoulderX, BODY.shoulderY + 0.03];
    points.push(...quadBezier(armholeStart, [shoulderX - 0.02, armholeY + 0.04], shoulderPoint));
    const neckPoint: Point = [neckX, top];
    points.push(neckPoint);
    points.push(...quadBezier(neckPoint, [neckX * 0.95, top - neckDepth], [0, top - neckDepth]));
    return points;
  };

  const zipGap = options.closure === 'zip' ? 0.05 : 0;
  const frontHalf = halfBody(0.16);
  if (zipGap) {
    pieces.push({ id: 'front-right', zone: 'corps', label: 'Devant droit', points: [shift(frontHalf, zipGap / 2, 0)], labelAt: [0.42, -0.05] });
    pieces.push({ id: 'front-left', zone: 'corps', label: 'Devant gauche', points: [shift(mirror(frontHalf), -zipGap / 2, 0)], labelAt: [-0.42, -0.05] });
  } else {
    const full = [...frontHalf, ...mirror(frontHalf).reverse()];
    pieces.push({ id: 'front', zone: 'corps', label: 'Devant', points: [full], labelAt: [0, -0.05] });
  }

  // Poches posées sur le devant, à leur place réelle (repère commun avec la 3D).
  const flatX = (dx: number, y: number) => {
    const x = Math.sign(dx) * arcFromFront(section(y), Math.abs(dx));
    return x + (zipGap && Math.abs(dx) > 0.02 ? Math.sign(dx) * zipGap / 2 : 0);
  };
  pocketQuads(options.pockets, bottom).forEach((quad) => {
    const corners = quad.corners.map(([dx, y]) => [flatX(dx, y), y] as Point);
    const cx = corners.reduce((sum, [x]) => sum + x, 0) / 4;
    const cy = corners.reduce((sum, [, y]) => sum + y, 0) / 4;
    pieces.push({ id: `pocket-${quad.key}`, zone: 'poches', label: 'Poche', points: [corners], labelAt: [cx, cy], overlay: true });
    if (quad.flap) {
      pieces.push({
        id: `flap-${quad.key}`,
        zone: 'poches',
        label: '',
        points: [quad.flap.map(([dx, y]) => [flatX(dx, y), y] as Point)],
        labelAt: [cx, cy],
        overlay: true,
      });
    }
  });

  if (options.closure === 'boutons') {
    pieces.push({
      id: 'placket',
      zone: 'corps',
      label: '',
      points: [[[-0.07, bottom + 0.13], [0.07, bottom + 0.13], [0.07, top - 0.16], [-0.07, top - 0.16]]],
      labelAt: [0, 0],
      overlay: true,
    });
  }

  // Bord-côte bas (devant), juste sous le devant : on voit où il se monte.
  const hemHalfFront = quarter(bottom);
  const hemGap = 0.07;
  pieces.push({
    id: 'hem-front',
    zone: 'bords',
    label: 'Bord-côte bas · devant',
    points: [[[-hemHalfFront, bottom - hemGap], [hemHalfFront, bottom - hemGap], [hemHalfFront, bottom - hemGap - 0.13], [-hemHalfFront, bottom - hemGap - 0.13]]],
    labelAt: [0, bottom - hemGap - 0.065],
  });

  // ---------------------------------------------------------------------
  // Manches et poignets, déroulés le long des bras (décalés vers l'extérieur)
  // ---------------------------------------------------------------------
  const connectors: [Point, Point][] = [];
  ([-1, 1] as const).forEach((side) => {
    const sleeve = sleeveLayout(raw, side);
    const dir: Point = [sleeve.direction.x, sleeve.direction.y];
    const outward: Point = [side * -dir[1], side * dir[0]];
    const halfWidth = (t: number) => Math.PI * sleeve.radiusAt(t);
    const w0 = halfWidth(0);
    const offset = w0 + 0.42;
    const origin: Point = [sleeve.joint.x + outward[0] * offset, sleeve.joint.y + outward[1] * offset];
    const toWorld = ([u, t]: Point): Point => [origin[0] + outward[0] * u + dir[0] * t, origin[1] + outward[1] * u + dir[1] * t];
    const cuffStart = sleeve.sleeveLength - 0.12;
    const capHeight = 0.3;

    const local: Point[] = [[-w0, 0]];
    for (let index = 1; index <= 12; index += 1) {
      const angle = (index / 12) * Math.PI;
      // Tête de manche : arrondie, plus haute au centre.
      local.push([-w0 * Math.cos(angle), -capHeight * Math.sin(angle) * (0.75 + 0.25 * Math.sin(angle))]);
    }
    for (let index = 0; index <= 8; index += 1) {
      const t = lerp(0, cuffStart, index / 8);
      local.push([halfWidth(t), t]);
    }
    for (let index = 8; index >= 0; index -= 1) {
      const t = lerp(0, cuffStart, index / 8);
      local.push([-halfWidth(t), t]);
    }
    const name = side < 0 ? 'gauche' : 'droite';
    pieces.push({
      id: `sleeve-${name}`,
      zone: 'manches',
      label: `Manche ${name}`,
      points: [local.map(toWorld)],
      labelAt: toWorld([0, cuffStart * 0.45]),
    });

    const cuffHalf = Math.PI * sleeve.cuffRadius;
    const c0 = cuffStart + 0.07;
    pieces.push({
      id: `cuff-${name}`,
      zone: 'bords',
      label: 'Poignet',
      points: [[[-cuffHalf, c0], [cuffHalf, c0], [cuffHalf, c0 + 0.13], [-cuffHalf, c0 + 0.13]].map((point) => toWorld(point as Point))],
      labelAt: toWorld([0, c0 + 0.065]),
    });

    // Trait de rappel : bout de la manche à plat → fin de la manche portée sur le bras.
    const wornEnd: Point = [sleeve.joint.x + dir[0] * sleeve.sleeveLength, sleeve.joint.y + dir[1] * sleeve.sleeveLength];
    connectors.push([toWorld([-cuffHalf, c0 + 0.13]), wornEnd]);
  });

  // ---------------------------------------------------------------------
  // Col ou capuche, au-dessus de l'encolure
  // ---------------------------------------------------------------------
  const collarHeight = collarHeightFrom(options.collar, values.col_hauteur);
  const collarLength = 4 * neckX;
  const collarBase = top + 0.1;
  let collarHandle: FlatHandles['collar'] = null;
  if (options.collar === 'capuche') {
    const panel: Point[] = [[0, 0], [0.62, 0]];
    for (let index = 1; index <= 10; index += 1) {
      const angle = (index / 10) * Math.PI * 0.85;
      panel.push([0.33 + 0.42 * Math.cos(angle) * (1 - index / 30), 0.48 + 0.48 * Math.sin(angle)]);
    }
    panel.push([0, 0.55]);
    const placed = (sign: number) => panel.map(([x, y]) => [sign * (0.33 + x), collarBase + 0.02 + y] as Point);
    pieces.push({ id: 'hood-right', zone: 'col', label: 'Capuche', points: [placed(1)], labelAt: [0.68, collarBase + 0.45] });
    pieces.push({ id: 'hood-left', zone: 'col', label: 'Capuche', points: [placed(-1)], labelAt: [-0.68, collarBase + 0.45] });
    pieces.push({
      id: 'collar',
      zone: 'col',
      label: '',
      points: [[[-collarLength / 2, collarBase - 0.06], [collarLength / 2, collarBase - 0.06], [collarLength / 2, collarBase - 0.01], [-collarLength / 2, collarBase - 0.01]]],
      labelAt: [0, collarBase],
    });
  } else {
    const label = options.collar === 'rond' ? 'Col rond' : options.collar === 'bord_cote' ? 'Col bord-côte' : 'Col montant';
    const band: Point[] = [
      [-collarLength / 2, collarBase + 0.04],
      ...quadBezier([-collarLength / 2, collarBase + 0.04], [0, collarBase - 0.04], [collarLength / 2, collarBase + 0.04]),
      [collarLength / 2 - 0.03, collarBase + 0.04 + collarHeight],
      ...quadBezier([collarLength / 2 - 0.03, collarBase + 0.04 + collarHeight], [0, collarBase + collarHeight - 0.04], [-collarLength / 2 + 0.03, collarBase + 0.04 + collarHeight]),
    ];
    pieces.push({ id: 'collar', zone: 'col', label, points: [band], labelAt: [collarLength / 2 + 0.05, collarBase + collarHeight / 2] });
    collarHandle = { point: [0, collarBase + collarHeight], base: collarBase };
  }

  // ---------------------------------------------------------------------
  // Dos (et son bord-côte), sous la silhouette
  // ---------------------------------------------------------------------
  const backHalf = halfBody(0.05);
  const backTop = -2.0;
  const backShift = backTop - top;
  const backFull = [...backHalf, ...mirror(backHalf).reverse()];
  pieces.push({ id: 'back', zone: 'corps', label: 'Dos', points: [shift(backFull, 0, backShift)], labelAt: [0, (top + bottom) / 2 + backShift] });
  const backHem = bottom + backShift - hemGap;
  pieces.push({
    id: 'hem-back',
    zone: 'bords',
    label: 'Bord-côte bas · dos',
    points: [[[-hemHalfFront, backHem], [hemHalfFront, backHem], [hemHalfFront, backHem - 0.13], [-hemHalfFront, backHem - 0.13]]],
    labelAt: [0, backHem - 0.065],
  });

  // ---------------------------------------------------------------------
  // Poignées d'édition et cadrage
  // ---------------------------------------------------------------------
  const sideY = -0.2;
  const sleeveEnd: Point = (() => {
    const piece = pieces.find((item) => item.id === 'sleeve-droite');
    const dir: Point = [right.direction.x, right.direction.y];
    const outward: Point = [-dir[1], dir[0]];
    const offset = Math.PI * right.radiusAt(0) + 0.42;
    const origin: Point = [right.joint.x + outward[0] * offset, right.joint.y + outward[1] * offset];
    const end: Point = [origin[0] + dir[0] * (right.sleeveLength - 0.12), origin[1] + dir[1] * (right.sleeveLength - 0.12)];
    return piece ? end : [0, 0];
  })();
  const sleeveOrigin: Point = (() => {
    const dir: Point = [right.direction.x, right.direction.y];
    const outward: Point = [-dir[1], dir[0]];
    const offset = Math.PI * right.radiusAt(0) + 0.42;
    return [right.joint.x + outward[0] * offset, right.joint.y + outward[1] * offset];
  })();

  const all = [
    ...pieces.flatMap((piece) => piece.points.flat()),
    ...arms.flat(),
    [head.cx - head.rx, head.cy + head.ry] as Point,
  ];
  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  const margin = 0.12;

  return {
    pieces,
    silhouette: { torso, arms, legs, neck, head },
    worn,
    connectors,
    levels: LEVELS,
    bounds: {
      minX: Math.min(...xs, -2.4) - margin - 0.35,
      maxX: Math.max(...xs, 2.4) + margin,
      minY: Math.min(...ys) - margin,
      maxY: Math.max(...ys) + margin,
    },
    handles: {
      hem: [0, bottom],
      side: [quarter(sideY) + zipGap / 2, sideY],
      sleeve: {
        point: sleeveEnd,
        origin: sleeveOrigin,
        direction: [right.direction.x, right.direction.y],
        fullLength: right.fullLength,
      },
      collar: collarHandle,
    },
    readout: {
      length: describeLength(bottom),
      sleeves: describeSleeves(right.fraction),
    },
  };
}

// ---------------------------------------------------------------------------
// Inverses : position d'une poignée → valeur de réglage (0 à 100)
// ---------------------------------------------------------------------------

const clamp100 = (value: number) => Math.round(Math.min(100, Math.max(0, value)));

export function lengthFromHem(y: number): number {
  return clamp100(55 + (-1.05 - y) / 0.006);
}

export function sleevesFromEnd(t: number, fullLength: number): number {
  const fraction = (t + 0.12) / fullLength;
  return clamp100(((fraction - 0.3) / 0.7) * 100);
}

export function collarFromHeight(style: GarmentOptions['collar'], height: number): number {
  if (style === 'rond') return clamp100((height - 0.05) / 0.0006);
  if (style === 'bord_cote') return clamp100((height - 0.08) / 0.0015);
  return clamp100((height - 0.12) / 0.0035);
}

/** Ampleur qui donne cette demi-largeur à plat à la taille (recherche simple, 0 à 100). */
export function boxyFromSide(x: number, raw: Record<string, number>, zipGap: number): number {
  let best = 0;
  let bestError = Number.POSITIVE_INFINITY;
  for (let boxy = 0; boxy <= 100; boxy += 2) {
    const fn = garmentSectionFn(readGarmentValues({ ...raw, boxy }));
    const error = Math.abs(arcFromFront(fn(-0.2), Math.PI / 2, 16) + zipGap / 2 - x);
    if (error < bestError) {
      bestError = error;
      best = boxy;
    }
  }
  return best;
}
