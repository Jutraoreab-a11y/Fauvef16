import type { ProductType } from '@/types/famal-spec';

export type PatternKind = 'fill' | 'stroke' | 'dash';

export interface PatternPiece {
  zone: string;
  d: string;
  kind: PatternKind;
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
