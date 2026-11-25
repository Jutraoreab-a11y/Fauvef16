import type { ProductType } from '@/types/famal-spec';
import {
  GARMENT_TOP,
  collarHeightFrom,
  defaultGarmentOptions,
  garmentBottomFromLength,
  pocketQuads,
} from './garment-options';
import type { StudioSpec } from './types';

export type PatternKind = 'fill' | 'stroke' | 'dash';

export interface PatternPiece {
  zone: string;
  d: string;
  kind: PatternKind;
  /** Trou dans la pièce (ouverture du visage de la capuche). */
  evenOdd?: boolean;
}

/** Repère commun des patrons : 520 × 600. Formes simplifiées, à remplacer par les vrais tracés. */
export const PATTERN_VIEWBOX = '0 0 520 600';

export const PATTERNS: Record<ProductType, PatternPiece[]> = {
  apparel: [
    { zone: 'corps', d: 'M150,170 L200,150 L320,150 L370,170 L370,470 Q260,490 150,470 Z', kind: 'fill' },
    { zone: 'manches', d: 'M150,170 L60,190 L30,420 L100,430 L150,300 Z M370,170 L460,190 L490,420 L420,430 L370,300 Z', kind: 'fill' },
    { zone: 'col', d: 'M200,150 Q260,120 320,150 L318,172 Q260,146 202,172 Z', kind: 'fill' },
    { zone: 'bords', d: 'M150,462 Q260,482 370,462 L370,474 Q260,494 150,474 Z M30,412 L100,422 L96,432 L28,422 Z M490,412 L420,422 L424,432 L492,422 Z', kind: 'fill' },
    { zone: 'poches', d: 'M190,330 L240,330 L240,380 L190,380 Z M280,330 L330,330 L330,380 L280,380 Z', kind: 'fill' },
    { zone: 'zip', d: 'M260,150 L260,490', kind: 'stroke' },
    { zone: 'boutons', d: 'M254,200 h12 v12 h-12 Z M254,260 h12 v12 h-12 Z M254,320 h12 v12 h-12 Z M254,380 h12 v12 h-12 Z', kind: 'fill' },
    { zone: 'couture', d: 'M150,172 L150,470 M370,172 L370,470', kind: 'dash' },
  ],
  gear: [
    { zone: 'coque', d: 'M150,120 Q260,60 370,120 Q400,260 360,380 Q260,420 160,380 Q120,260 150,120 Z', kind: 'fill' },
    { zone: 'pouce', d: 'M360,250 Q420,260 410,320 Q380,330 360,300 Z', kind: 'fill' },
    { zone: 'paume', d: 'M170,380 L350,380 L340,470 L180,470 Z', kind: 'fill' },
    { zone: 'manchette', d: 'M170,470 L340,470 L340,540 L170,540 Z', kind: 'fill' },
    { zone: 'scratch', d: 'M175,500 L335,500 L335,520 L175,520 Z', kind: 'dash' },
    { zone: 'couture', d: 'M150,120 Q260,60 370,120 Q400,260 360,380 Q260,420 160,380 Q120,260 150,120 Z', kind: 'dash' },
  ],
};

// Repère du devant à plat : milieu devant en x = 260, encolure en y = 150, bas en y = 470.
const CENTER_X = 260;
const PX_PER_RAD = 70;
const NECK_Y = 150;
const HEM_Y = 470;

const round = (value: number) => Math.round(value * 10) / 10;

/** Patron du gilet calculé depuis la spec : col et poches suivent exactement la 3D. */
export function apparelPattern(spec: StudioSpec): PatternPiece[] {
  const options = spec.garment ?? defaultGarmentOptions();
  const slider = (id: string, fallback: number) => spec.sliders.find((item) => item.id === id)?.value ?? fallback;
  const bottom = garmentBottomFromLength(slider('longueur', 55));
  const toX = (dx: number) => round(CENTER_X + dx * PX_PER_RAD);
  const toY = (y: number) => round(HEM_Y - ((y - bottom) / (GARMENT_TOP - bottom)) * (HEM_Y - NECK_Y));
  const quadPath = (corners: [number, number][]) =>
    `M${corners.map(([dx, y]) => `${toX(dx)},${toY(y)}`).join(' L')} Z`;

  const base = PATTERNS.apparel.filter((piece) => !['col', 'poches', 'boutons', 'couture', 'zip'].includes(piece.zone));
  const pieces: PatternPiece[] = [...base];

  // Col : bande au-dessus de l'encolure, hauteur à l'échelle de la 3D.
  const collarPx = round(collarHeightFrom(options.collar, slider('col_hauteur', 30)) * (HEM_Y - NECK_Y) / 2.09);
  const spread = options.collar === 'montant' ? 2 : options.collar === 'capuche' ? 10 : -2;
  const lift = (value: number) => round(value - collarPx);
  pieces.push({
    zone: 'col',
    kind: 'fill',
    d: `M200,152 Q260,132 320,152 L${320 + spread},${lift(152)} Q260,${lift(132)} ${200 - spread},${lift(152)} Z`,
  });
  if (options.collar === 'capuche') {
    const baseY = lift(152);
    pieces.push({
      zone: 'col',
      kind: 'fill',
      evenOdd: true,
      d: `M${190},${baseY} C170,${baseY - 70} 195,8 260,6 C325,8 350,${baseY - 70} 330,${baseY} Q260,${baseY - 22} 190,${baseY} Z `
        + 'M232,66 a28,38 0 1,0 56,0 a28,38 0 1,0 -56,0 Z',
    });
  }

  // Poches, rabats, pressions et piqûres : mêmes quadrilatères que la 3D.
  const quads = pocketQuads(options.pockets, bottom);
  quads.forEach((quad) => {
    pieces.push({ zone: 'poches', kind: 'fill', d: quadPath(quad.corners) });
    if (quad.flap) pieces.push({ zone: 'poches', kind: 'fill', d: quadPath(quad.flap) });
  });

  const snaps: [number, number][] = quads.flatMap((quad) => (quad.snap ? [quad.snap] : []));
  const snapPath = snaps.map(([dx, y]) => `M${toX(dx) - 5},${toY(y) - 5} h10 v10 h-10 Z`);
  if (options.collar === 'montant') {
    const y = round(152 - collarPx * 0.55);
    snapPath.push(`M227,${y - 5} h10 v10 h-10 Z`, `M283,${y - 5} h10 v10 h-10 Z`);
  }
  if (snapPath.length) pieces.push({ zone: 'boutons', kind: 'fill', d: snapPath.join(' ') });

  const seams = ['M150,172 L150,470 M370,172 L370,470'];
  quads.forEach((quad) => {
    const [tl, tr, br, bl] = quad.corners.map(([dx, y]) => [toX(dx), toY(y)]);
    const inset = 4;
    seams.push(`M${tl[0] + inset},${tl[1] + inset} L${tr[0] - inset},${tr[1] + inset} L${br[0] - inset},${br[1] - inset} L${bl[0] + inset},${bl[1] - inset} Z`);
  });
  pieces.push({ zone: 'couture', kind: 'dash', d: seams.join(' ') });

  // Le zip passe par-dessus les poches centrées, comme en 3D.
  pieces.push({ zone: 'zip', kind: 'stroke', d: `M260,${round(152 - (options.collar === 'montant' ? collarPx : 0))} L260,470` });

  return pieces;
}
